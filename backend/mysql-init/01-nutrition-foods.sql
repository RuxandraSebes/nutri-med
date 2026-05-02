-- Reserved table for Stage 3 mapping (CSV imports / tooling). Safe if empty.
CREATE TABLE IF NOT EXISTS nutrition_foods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(512) NOT NULL,
  kcal_per_100g DECIMAL(12,4) NULL,
  protein_g DECIMAL(12,4) NULL,
  carbs_g DECIMAL(12,4) NULL,
  fat_g DECIMAL(12,4) NULL,
  sodium_mg DECIMAL(12,4) NULL,
  sugars_g DECIMAL(12,4) NULL,
  source VARCHAR(64) DEFAULT 'dataset',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_name (name(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
