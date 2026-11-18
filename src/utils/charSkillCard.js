import { SERVER_URL } from "../config.js";

let _cache = null;
let _pending = null;

export async function loadCharSkills() {
  if (_cache) return _cache;
  if (_pending) return _pending;
  _pending = fetch(`${SERVER_URL}/characters/skills`)
    .then(r => r.json())
    .then(j => {
      _cache = Array.isArray(j?.data) ? j.data : [];
      return _cache;
    })
    .catch(() => [])
    .finally(() => { _pending = null; });
  return _pending;
}

export function findCharSkill(skills, charId, charName) {
  if (!Array.isArray(skills) || !skills.length) return null;
  if (charId) {
    const byId = skills.find(s => Number(s.character_id) === Number(charId));
    if (byId) return byId;
  }
  if (charName) {
    const clean = String(charName).replace(/ /g, "_").toLowerCase();
    const byName = skills.find(s => String(s.character_name || "").replace(/ /g, "_").toLowerCase() === clean);
    if (byName) return byName;
  }
  return null;
}

// Vẽ hộp thông tin kỹ năng (Nội tại + Chủ động) đồng bộ với UI BagScene / ShopScene
// Trả về chiều cao hộp đã vẽ để caller cộng vào layout
export function renderCharSkillBox(scene, push, cx, topY, w, skill) {
  if (!skill) return 0;

  const padX = 10;
  const padY = 8;
  const textW = w - padX * 2;

  const pText = scene.add.text(0, 0, `Nội tại · ${skill.passive_name}: ${skill.passive_desc}`, {
    fontFamily: "Signika", fontSize: "11px", color: "#1c5a38",
    wordWrap: { width: textW }, lineSpacing: 2,
  });
  const aText = scene.add.text(0, 0, `Chủ động · ${skill.active_name}: ${skill.active_desc}`, {
    fontFamily: "Signika", fontSize: "11px", color: "#6b3800",
    wordWrap: { width: textW }, lineSpacing: 2,
  });

  const pH = pText.height;
  const aH = aText.height;
  const boxH = padY * 2 + pH + 8 + aH;
  const left = cx - w / 2;

  const g = push(scene.add.graphics().setDepth(4));
  g.fillStyle(0xffffff, 0.62);
  g.fillRoundedRect(left, topY, w, boxH, 10);
  g.lineStyle(1.5, 0xc8a060, 0.55);
  g.strokeRoundedRect(left, topY, w, boxH, 10);

  // Dải màu trái tạo điểm nhấn giống thẻ tác dụng TarotScene
  g.fillStyle(0xd4a030, 1);
  g.fillRoundedRect(left, topY + 6, 4, boxH - 12, 2);

  // Divider giữa Nội tại và Chủ động
  const divY = topY + padY + pH + 4;
  g.lineStyle(1, 0xc8a060, 0.35);
  g.lineBetween(left + padX, divY, left + w - padX, divY);

  pText.setPosition(left + padX + 2, topY + padY).setOrigin(0, 0).setDepth(5);
  aText.setPosition(left + padX + 2, divY + 4).setOrigin(0, 0).setDepth(5);
  push(pText);
  push(aText);

  return boxH;
}
