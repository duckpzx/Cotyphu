-- Migration: Thêm tarot_levels và tarot_luck_pity vào bảng users
ALTER TABLE users ADD COLUMN tarot_levels JSON NULL;
ALTER TABLE users ADD COLUMN tarot_luck_pity JSON NULL;
