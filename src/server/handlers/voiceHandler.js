/**
 * WebRTC Voice Chat Signaling Handler (Socket.IO)
 * Phòng tối đa 4 người → dùng WebRTC Mesh P2P, server chỉ chuyển tiếp offer/answer/ICE & trạng thái mic.
 */

// Map<voiceKey, Map<socketId, { socket_id, user_id, name, muted, speaking }>>
const voiceRooms = new Map();

function leaveCurrentVoiceRoom(socket, io) {
  const key = socket._voiceRoomKey;
  if (!key) return;
  socket._voiceRoomKey = null;

  const peers = voiceRooms.get(key);
  if (peers) {
    peers.delete(socket.id);
    if (peers.size === 0) voiceRooms.delete(key);
  }

  socket.leave(key);
  io.to(key).emit("voice:peer_left", {
    socket_id: socket.id,
    user_id: Number(socket.user_id),
  });
}

export function registerVoiceHandlers(socket, io) {
  socket.on("voice:join", ({ room_id, muted = true, name = null } = {}) => {
    const rid = Number(room_id);
    if (!rid) return;

    const key = `voice_${rid}`;
    if (socket._voiceRoomKey && socket._voiceRoomKey !== key) {
      leaveCurrentVoiceRoom(socket, io);
    }

    if (!voiceRooms.has(key)) voiceRooms.set(key, new Map());
    const peers = voiceRooms.get(key);

    // Gửi danh sách peer hiện có cho người mới vào (trừ chính mình)
    const existingPeers = [];
    peers.forEach((info, sid) => {
      if (sid !== socket.id) existingPeers.push(info);
    });

    const myInfo = {
      socket_id: socket.id,
      user_id: Number(socket.user_id),
      name: name || socket.player_name || "Player",
      muted: !!muted,
      speaking: false,
    };

    peers.set(socket.id, myInfo);
    socket._voiceRoomKey = key;
    socket.join(key);

    socket.emit("voice:peers", { room_id: rid, peers: existingPeers });
    socket.to(key).emit("voice:peer_joined", myInfo);
  });

  socket.on("voice:leave", () => {
    leaveCurrentVoiceRoom(socket, io);
  });

  socket.on("voice:offer", ({ to_socket_id, sdp } = {}) => {
    if (!to_socket_id || !sdp) return;
    console.log(`📡 [VOICE] offer ${socket.id} -> ${to_socket_id}`);
    io.to(to_socket_id).emit("voice:offer", {
      from_socket_id: socket.id,
      from_user_id: Number(socket.user_id),
      sdp,
    });
  });

  socket.on("voice:answer", ({ to_socket_id, sdp } = {}) => {
    if (!to_socket_id || !sdp) return;
    console.log(`📡 [VOICE] answer ${socket.id} -> ${to_socket_id}`);
    io.to(to_socket_id).emit("voice:answer", {
      from_socket_id: socket.id,
      from_user_id: Number(socket.user_id),
      sdp,
    });
  });

  socket.on("voice:ice", ({ to_socket_id, candidate } = {}) => {
    if (!to_socket_id || !candidate) return;
    io.to(to_socket_id).emit("voice:ice", {
      from_socket_id: socket.id,
      from_user_id: Number(socket.user_id),
      candidate,
    });
  });

  // Relay âm thanh PCM trực tiếp qua Socket.IO (không bao giờ lỗi ICE/NAT/Firewall)
  socket.on("voice:audio", ({ pcm, sampleRate = 16000 } = {}) => {
    const key = socket._voiceRoomKey;
    if (!key || !pcm) return;
    const byteLen = pcm.byteLength || pcm.length || 0;
    if (byteLen <= 0 || byteLen > 32768) return;
    socket.to(key).emit("voice:audio", {
      from_socket_id: socket.id,
      from_user_id: Number(socket.user_id),
      pcm,
      sampleRate: Number(sampleRate) || 16000,
    });
  });

  socket.on("voice:mute_state", ({ muted, speaking = false } = {}) => {
    const key = socket._voiceRoomKey;
    if (!key) return;
    const peers = voiceRooms.get(key);
    const info = peers?.get(socket.id);
    const prevMuted = info ? info.muted : null;
    if (info) {
      info.muted = !!muted;
      info.speaking = !!speaking && !info.muted;
    }
    if (prevMuted !== null && prevMuted !== !!muted) {
      console.log(`🎙️ [VOICE][${key}] ${info?.name || socket.player_name || socket.user_id}: ${muted ? "TẮT mic" : "MỞ mic"}`);
    }
    io.to(key).emit("voice:peer_state", {
      socket_id: socket.id,
      user_id: Number(socket.user_id),
      muted: !!muted,
      speaking: !!speaking && !muted,
    });
  });

  // Nhận lời nói (Speech-to-Text từ client) và in ra terminal server
  socket.on("voice:transcript", ({ text } = {}) => {
    const clean = String(text || "").trim().slice(0, 300);
    if (!clean) return;
    const key = socket._voiceRoomKey || "unknown";
    const peers = voiceRooms.get(key);
    const info = peers?.get(socket.id);
    const speaker = info?.name || socket.player_name || `User#${socket.user_id}`;
    console.log(`🗣️ [VOICE][${key}] ${speaker}: "${clean}"`);
  });

  socket.on("voice:debug", ({ msg } = {}) => {
    if (!msg) return;
    const key = socket._voiceRoomKey || "unknown";
    const info = voiceRooms.get(key)?.get(socket.id);
    const speaker = info?.name || socket.player_name || socket.id;
    console.log(`📊 [VOICE][${key}] ${speaker}: ${String(msg).slice(0, 240)}`);
  });

  socket.on("disconnect", () => {
    leaveCurrentVoiceRoom(socket, io);
  });
}
