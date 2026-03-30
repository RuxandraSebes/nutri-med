const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "BodyComposition",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      record_id: { type: DataTypes.INTEGER, allowNull: false },
      fat_pct: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      water_pct: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      muscle_mass_kg: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      visceral_fat_level: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    },
    {
      tableName: "body_composition",
      timestamps: false,
      underscored: true,
    },
  );

