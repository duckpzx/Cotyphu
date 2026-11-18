CREATE TABLE IF NOT EXISTS `character_skills` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `character_id` INT NOT NULL,
  `passive_name` VARCHAR(100) NOT NULL,
  `passive_desc` TEXT NOT NULL,
  `passive_type` VARCHAR(50) NOT NULL,
  `passive_value` INT NOT NULL DEFAULT 0,
  `active_name` VARCHAR(100) NOT NULL,
  `active_desc` TEXT NOT NULL,
  `active_type` VARCHAR(50) NOT NULL,
  `active_value` INT NOT NULL DEFAULT 0,
  `target_mode` ENUM('none', 'self', 'enemy', 'enemy_cell', 'any_cell') NOT NULL DEFAULT 'none',
  `energy_cost` INT NOT NULL DEFAULT 100,
  `fx_type` VARCHAR(30) NOT NULL DEFAULT 'fire_ball',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_character_skill` (`character_id`),
  CONSTRAINT `fk_skill_character` FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
