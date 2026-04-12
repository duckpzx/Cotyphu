/**
 * EcoinManager — Đồng bộ ecoin toàn cục giữa tất cả scenes
 * 
 * Sử dụng Phaser registry events + localStorage để broadcast
 * thay đổi ecoin tới mọi scene mà không cần reload.
 * 
 * Cách dùng:
 *   import EcoinManager from "...ecoinManager.js";
 *   
 *   // Trong create():
 *   EcoinManager.init(this);    // chỉ cần gọi 1 lần (sẽ tự bỏ qua nếu đã init)
 *   const ecoin = EcoinManager.get();
 *   
 *   // Khi mua hàng/nạp tiền:
 *   EcoinManager.set(this, newEcoin);
 *   
 *   // Đăng ký lắng nghe thay đổi:
 *   EcoinManager.onChange(this, (newVal) => { coinText.setText(...) });
 *   
 *   // Fetch ecoin mới nhất từ server:
 *   await EcoinManager.fetchFromServer(this, userId);
 */

const REGISTRY_KEY = "__ecoin__";
const EVENT_KEY    = "ecoin_changed";

const EcoinManager = {

    /**
     * Khởi tạo — đọc từ localStorage nếu chưa có trong registry
     */
    init(scene) {
        if (scene.registry.get(REGISTRY_KEY) != null) return;

        let ecoin = 0;
        try {
            const pd = JSON.parse(localStorage.getItem("playerData"));
            ecoin = Number(pd?.user?.ecoin ?? 0);
        } catch(e) {}

        scene.registry.set(REGISTRY_KEY, ecoin);
    },

    /**
     * Lấy giá trị ecoin hiện tại
     */
    get(scene) {
        if (scene) return Number(scene.registry.get(REGISTRY_KEY) ?? 0);

        // fallback: đọc từ localStorage
        try {
            const pd = JSON.parse(localStorage.getItem("playerData"));
            return Number(pd?.user?.ecoin ?? 0);
        } catch(e) { return 0; }
    },

    /**
     * Cập nhật ecoin — broadcast tới tất cả scenes + lưu localStorage
     */
    set(scene, newEcoin) {
        const val = Number(newEcoin);
        scene.registry.set(REGISTRY_KEY, val);

        // Cập nhật localStorage
        try {
            const pd = JSON.parse(localStorage.getItem("playerData")) || {};
            if (!pd.user) pd.user = {};
            pd.user.ecoin = val;
            localStorage.setItem("playerData", JSON.stringify(pd));
        } catch(e) {}

        // Emit event cho mọi scene đang active
        scene.registry.events.emit(EVENT_KEY, val);
    },

    /**
     * Đăng ký callback khi ecoin thay đổi
     * Tự động cleanup khi scene bị destroy
     */
    onChange(scene, callback) {
        const handler = (val) => callback(val);
        scene.registry.events.on(EVENT_KEY, handler);

        // Auto cleanup
        scene.events.once("shutdown", () => {
            scene.registry.events.off(EVENT_KEY, handler);
        });
        scene.events.once("destroy", () => {
            scene.registry.events.off(EVENT_KEY, handler);
        });
    },

    /**
     * Fetch ecoin mới nhất từ server và broadcast
     */
    async fetchFromServer(scene, userId) {
        if (!userId) return EcoinManager.get(scene);
        try {
            const res = await fetch(`http://localhost:3000/users/${userId}/ecoin`);
            const json = await res.json();
            if (json.success) {
                EcoinManager.set(scene, json.ecoin);
                return json.ecoin;
            }
        } catch(e) {
            console.warn("EcoinManager: fetch error", e);
        }
        return EcoinManager.get(scene);
    },

    /**
     * Format tiền cho hiển thị
     */
    format(val) {
        return Number(val || 0).toLocaleString("en-US");
    }
};

export default EcoinManager;
