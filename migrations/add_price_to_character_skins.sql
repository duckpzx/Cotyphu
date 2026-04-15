-- Thêm cột price vào character_skins nếu chưa có
ALTER TABLE character_skins
  ADD COLUMN IF NOT EXISTS price INT NOT NULL DEFAULT 0;

-- Set giá mặc định theo skin_number
UPDATE character_skins SET price = 0     WHERE skin_number = 1;
UPDATE character_skins SET price = 15000 WHERE skin_number = 2;
UPDATE character_skins SET price = 35000 WHERE skin_number = 3;
