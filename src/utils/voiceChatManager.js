/**
 * VoiceChatManager — Voice chat thời gian thực qua Socket.IO Binary PCM (16kHz Int16 mono)
 * - Không phụ thuộc WebRTC ICE/STUN/TURN → chạy ổn định 100% giữa 2 trình duyệt trên 1 máy, LAN, Wi-Fi, 4G, VPN
 * - Tự động nhận và phát âm thanh từ người chơi khác kể cả khi mic mình đang tắt
 * - Giữ nguyên trạng thái mic khi chuyển RoomScene -> BoardScene
 * - Tích hợp Speech-to-Text (vi-VN) in log lời nói ra terminal server
 */

const TARGET_SAMPLE_RATE = 16000;

function downsampleToInt16(float32, inputRate, outputRate) {
  if (inputRate <= outputRate) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = inputRate / outputRate;
  const newLen = Math.floor(float32.length / ratio);
  const out = new Int16Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = float32[idx] || 0;
    const b = float32[Math.min(idx + 1, float32.length - 1)] || a;
    const s = Math.max(-1, Math.min(1, a + (b - a) * frac));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

class VoiceChatManager {
  constructor() {
    this.socket = null;
    this.roomId = null;
    this.myUserId = null;
    this.myName = "Player";

    this.micEnabled = false;     // mặc định TẮT
    this.isSpeaking = false;
    this.localStream = null;

    // Map<userId, { muted, speaking }>
    this.userStates = new Map();
    // Map<socketId, { nextPlayTime }>
    this._peerPlayback = new Map();

    this._stateListeners = new Set();
    this._errorListeners = new Set();

    // Capture audio context (gửi mic)
    this._capCtx = null;
    this._capSource = null;
    this._capProc = null;
    this._capMuteGain = null;
    this._hangFrames = 0;

    // Playback audio context (nghe người khác)
    this._playCtx = null;
    this._unlockBound = false;

    // Speech-to-Text
    this._speechRec = null;

    this._boundHandlers = null;
    this._toggling = false;
  }

  // ── Pub/Sub cho UI ───────────────────────────────────────────────────
  onStateChange(cb) {
    if (typeof cb !== "function") return () => {};
    this._stateListeners.add(cb);
    try { cb(this.getSnapshot()); } catch {}
    return () => this._stateListeners.delete(cb);
  }

  onError(cb) {
    if (typeof cb !== "function") return () => {};
    this._errorListeners.add(cb);
    return () => this._errorListeners.delete(cb);
  }

  getSnapshot() {
    return {
      roomId: this.roomId,
      micEnabled: this.micEnabled,
      isSpeaking: this.isSpeaking,
      userStates: new Map(this.userStates),
    };
  }

  _notifyState() {
    const snap = this.getSnapshot();
    this._stateListeners.forEach(cb => {
      try { cb(snap); } catch {}
    });
  }

  _notifyError(msg) {
    this._errorListeners.forEach(cb => {
      try { cb(msg); } catch {}
    });
  }

  // ── Tham gia kênh voice của phòng / trận ─────────────────────────────
  join(socket, roomId, myUserId, myName = "Player") {
    const rid = Number(roomId);
    if (!socket || !rid) return;

    if (this.socket && this.socket !== socket) {
      this._unbindSocket();
      this._peerPlayback.clear();
    } else if (this.socket === socket && this.roomId === rid) {
      this._notifyState();
      return;
    } else if (this.socket === socket && this.roomId !== rid) {
      this._peerPlayback.clear();
    }

    this.socket = socket;
    this.roomId = rid;
    this.myUserId = myUserId ? Number(myUserId) : null;
    this.myName = myName || "Player";

    if (this.myUserId) {
      this.userStates.set(this.myUserId, { muted: !this.micEnabled, speaking: this.isSpeaking });
    }

    this._ensurePlaybackUnlock();
    this._bindSocket();

    const emitJoin = () => {
      if (!this.socket || this.roomId !== rid) return;
      this.socket.emit("voice:join", {
        room_id: rid,
        muted: !this.micEnabled,
        name: this.myName,
      });
    };

    if (socket.connected) {
      emitJoin();
    } else {
      socket.once("connect", emitJoin);
    }

    this._notifyState();
  }

  /**
   * Tháo socket khi chuyển cảnh RoomScene -> BoardScene nhưng GIỮ NGUYÊN micEnabled & localStream
   */
  detachForSceneTransition() {
    if (this.socket) {
      try { this.socket.emit("voice:leave"); } catch {}
      this._unbindSocket();
      this.socket = null;
    }
    this._peerPlayback.clear();
    this._notifyState();
  }

  /**
   * Rời hẳn phòng / thoát trận — tắt mic, giải phóng micro và đóng audio context
   */
  leave() {
    if (this.socket) {
      try { this.socket.emit("voice:leave"); } catch {}
      this._unbindSocket();
      this.socket = null;
    }
    this._stopCapture();
    this._stopSpeechTranscript();
    this._releaseLocalStream();
    this._peerPlayback.clear();
    this.roomId = null;
    this.micEnabled = false;
    this.isSpeaking = false;
    this.userStates.clear();
    this._notifyState();
  }

  // ── Bật / Tắt Mic ────────────────────────────────────────────────────
  async toggleMic() {
    if (this._toggling) return this.micEnabled;
    return this.setMicEnabled(!this.micEnabled);
  }

  async setMicEnabled(enable) {
    if (this._toggling) return this.micEnabled;
    this._toggling = true;
    try {
      if (enable) {
        const ok = await this._ensureLocalStream();
        if (!ok) {
          this.micEnabled = false;
          this._notifyState();
          return false;
        }
        this.localStream.getAudioTracks().forEach(t => { t.enabled = true; });
        this.micEnabled = true;
        this._startCapture();
        this._startSpeechTranscript();
      } else {
        this.micEnabled = false;
        this.isSpeaking = false;
        this._stopCapture();
        this._stopSpeechTranscript();
        if (this.localStream) {
          this.localStream.getAudioTracks().forEach(t => { t.enabled = false; });
        }
      }

      if (this.myUserId) {
        this.userStates.set(this.myUserId, { muted: !this.micEnabled, speaking: this.isSpeaking });
      }
      this.socket?.emit("voice:mute_state", {
        muted: !this.micEnabled,
        speaking: this.isSpeaking,
      });
      this._notifyState();
      return this.micEnabled;
    } finally {
      this._toggling = false;
    }
  }

  async _ensureLocalStream() {
    if (this.localStream && this.localStream.getAudioTracks().some(t => t.readyState === "live")) {
      return true;
    }
    if (!navigator?.mediaDevices?.getUserMedia) {
      this._notifyError("Trình duyệt chặn micro (cần chạy trên localhost hoặc HTTPS)!");
      return false;
    }
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      return true;
    } catch (err) {
      console.warn("🎙️ Không thể mở micro:", err);
      const msg = err?.name === "NotAllowedError"
        ? "Bạn đã từ chối quyền Micro! Hãy cấp quyền trên thanh địa chỉ trình duyệt."
        : err?.name === "NotFoundError"
        ? "Không tìm thấy thiết bị Micro trên máy!"
        : "Không thể mở Micro, vui lòng kiểm tra lại thiết bị!";
      this._notifyError(msg);
      return false;
    }
  }

  _releaseLocalStream() {
    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach(t => t.stop());
      } catch {}
      this.localStream = null;
    }
  }

  // ── Thu âm PCM từ mic & gửi qua Socket.IO ───────────────────────────
  _startCapture() {
    this._stopCapture();
    if (!this.localStream) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this._capCtx = new AudioCtx();
      if (this._capCtx.state === "suspended") {
        this._capCtx.resume().catch(() => {});
      }
      this._capSource = this._capCtx.createMediaStreamSource(this.localStream);
      // 4096 samples @ 48kHz ≈ 85ms mỗi gói (~2.7KB sau khi downsample 16kHz Int16)
      this._capProc = this._capCtx.createScriptProcessor(4096, 1, 1);
      // Nối qua gain = 0 để trình duyệt không phát tiếng mic của chính mình ra loa cục bộ
      this._capMuteGain = this._capCtx.createGain();
      this._capMuteGain.gain.value = 0;

      this._hangFrames = 0;
      const inRate = this._capCtx.sampleRate || 48000;

      this._capProc.onaudioprocess = (ev) => {
        if (!this.micEnabled || !this.socket?.connected) return;
        const input = ev.inputBuffer.getChannelData(0);

        // Tính RMS để phát hiện đang nói & bỏ qua lúc hoàn toàn im lặng
        let sum = 0;
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
        const rms = Math.sqrt(sum / input.length);
        const loud = rms > 0.012;

        if (loud) {
          this._hangFrames = 5; // giữ thêm ~400ms đuôi câu để không bị cụt chữ
          if (!this.isSpeaking) {
            this.isSpeaking = true;
            if (this.myUserId) this.userStates.set(this.myUserId, { muted: false, speaking: true });
            this.socket.emit("voice:mute_state", { muted: false, speaking: true });
            this._notifyState();
          }
        } else if (this._hangFrames > 0) {
          this._hangFrames--;
        } else if (this.isSpeaking) {
          this.isSpeaking = false;
          if (this.myUserId) this.userStates.set(this.myUserId, { muted: false, speaking: false });
          this.socket.emit("voice:mute_state", { muted: false, speaking: false });
          this._notifyState();
        }

        // Gửi gói PCM khi đang có tiếng nói (hoặc trong hang-time)
        if (loud || this._hangFrames > 0) {
          const int16 = downsampleToInt16(input, inRate, TARGET_SAMPLE_RATE);
          this.socket.emit("voice:audio", {
            pcm: int16.buffer,
            sampleRate: TARGET_SAMPLE_RATE,
          });
        }
      };

      this._capSource.connect(this._capProc);
      this._capProc.connect(this._capMuteGain);
      this._capMuteGain.connect(this._capCtx.destination);
    } catch (err) {
      console.warn("🎙️ _startCapture error:", err);
    }
  }

  _stopCapture() {
    try { this._capProc?.disconnect(); } catch {}
    try { this._capSource?.disconnect(); } catch {}
    try { this._capMuteGain?.disconnect(); } catch {}
    this._capProc = null;
    this._capSource = null;
    this._capMuteGain = null;
    if (this._capCtx) {
      try { this._capCtx.close(); } catch {}
      this._capCtx = null;
    }
  }

  // ── Phát âm thanh PCM nhận từ người chơi khác ────────────────────────
  _ensurePlaybackUnlock() {
    if (this._unlockBound) return;
    this._unlockBound = true;
    const unlock = () => {
      if (this._playCtx && this._playCtx.state === "suspended") {
        this._playCtx.resume().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
  }

  _getPlayContext() {
    if (!this._playCtx || this._playCtx.state === "closed") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this._playCtx = new AudioCtx();
    }
    if (this._playCtx.state === "suspended") {
      this._playCtx.resume().catch(() => {});
    }
    return this._playCtx;
  }

  _playIncomingPcm(fromSocketId, pcmData, sampleRate = TARGET_SAMPLE_RATE) {
    const ctx = this._getPlayContext();
    if (!ctx) return;

    let int16;
    if (pcmData instanceof ArrayBuffer) {
      int16 = new Int16Array(pcmData);
    } else if (ArrayBuffer.isView(pcmData)) {
      int16 = new Int16Array(pcmData.buffer, pcmData.byteOffset, Math.floor(pcmData.byteLength / 2));
    } else {
      return;
    }
    if (!int16.length) return;

    const rate = Number(sampleRate) || TARGET_SAMPLE_RATE;
    const buf = ctx.createBuffer(1, int16.length, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < int16.length; i++) {
      ch[i] = int16[i] / 32768;
    }

    let st = this._peerPlayback.get(fromSocketId);
    if (!st) {
      st = { nextPlayTime: 0 };
      this._peerPlayback.set(fromSocketId, st);
    }

    const now = ctx.currentTime;
    // Giữ jitter buffer 40ms, tự reset nếu bị trễ hoặc trôi quá 350ms
    if (st.nextPlayTime < now || st.nextPlayTime > now + 0.35) {
      st.nextPlayTime = now + 0.04;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(st.nextPlayTime);
    st.nextPlayTime += buf.duration;
  }

  // ── Nhận diện lời nói (Speech-to-Text vi-VN) gửi log ra terminal server ──
  _startSpeechTranscript() {
    this._stopSpeechTranscript();
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      const rec = new SpeechRec();
      rec.lang = "vi-VN";
      rec.continuous = true;
      rec.interimResults = false;

      rec.onresult = (ev) => {
        if (!this.micEnabled) return;
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r?.isFinal) {
            const text = String(r[0]?.transcript || "").trim();
            if (text) {
              console.log(`🗣️ [MIC] ${this.myName}: "${text}"`);
              this.socket?.emit("voice:transcript", { text });
            }
          }
        }
      };

      rec.onerror = (ev) => {
        if (ev?.error === "not-allowed" || ev?.error === "service-not-allowed") {
          this._stopSpeechTranscript();
        }
      };

      rec.onend = () => {
        if (this._speechRec === rec && this.micEnabled) {
          setTimeout(() => {
            if (this._speechRec === rec && this.micEnabled) {
              try { rec.start(); } catch {}
            }
          }, 300);
        }
      };

      this._speechRec = rec;
      rec.start();
    } catch {}
  }

  _stopSpeechTranscript() {
    const rec = this._speechRec;
    this._speechRec = null;
    if (rec) {
      try { rec.onend = null; rec.stop(); } catch {}
    }
  }

  // ── Socket.IO Events ─────────────────────────────────────────────────
  _bindSocket() {
    if (!this.socket) return;
    this._unbindSocket();

    const onPeers = ({ peers = [] } = {}) => {
      peers.forEach(peer => {
        if (peer?.user_id) {
          this.userStates.set(Number(peer.user_id), { muted: !!peer.muted, speaking: !!peer.speaking });
        }
      });
      this._notifyState();
    };

    const onPeerJoined = (peer) => {
      if (peer?.user_id) {
        this.userStates.set(Number(peer.user_id), { muted: !!peer.muted, speaking: !!peer.speaking });
      }
      this._notifyState();
    };

    const onPeerLeft = ({ socket_id, user_id } = {}) => {
      this._peerPlayback.delete(socket_id);
      if (user_id) this.userStates.delete(Number(user_id));
      this._notifyState();
    };

    const onPeerState = ({ user_id, muted, speaking } = {}) => {
      if (user_id) {
        this.userStates.set(Number(user_id), { muted: !!muted, speaking: !!speaking });
      }
      this._notifyState();
    };

    const onAudio = ({ from_socket_id, pcm, sampleRate } = {}) => {
      if (!from_socket_id || from_socket_id === this.socket?.id || !pcm) return;
      this._playIncomingPcm(from_socket_id, pcm, sampleRate);
    };

    this._boundHandlers = { onPeers, onPeerJoined, onPeerLeft, onPeerState, onAudio };
    this.socket.on("voice:peers", onPeers);
    this.socket.on("voice:peer_joined", onPeerJoined);
    this.socket.on("voice:peer_left", onPeerLeft);
    this.socket.on("voice:peer_state", onPeerState);
    this.socket.on("voice:audio", onAudio);
  }

  _unbindSocket() {
    if (!this.socket || !this._boundHandlers) return;
    const h = this._boundHandlers;
    this.socket.off("voice:peers", h.onPeers);
    this.socket.off("voice:peer_joined", h.onPeerJoined);
    this.socket.off("voice:peer_left", h.onPeerLeft);
    this.socket.off("voice:peer_state", h.onPeerState);
    this.socket.off("voice:audio", h.onAudio);
    this._boundHandlers = null;
  }
}

export const voiceChat = new VoiceChatManager();
export default voiceChat;
