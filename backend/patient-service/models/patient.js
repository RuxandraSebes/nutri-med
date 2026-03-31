const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "Patient",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      public_patient_id: {
        type: DataTypes.STRING(32),
        allowNull: true,
        unique: true,
      },
      age: { type: DataTypes.INTEGER, allowNull: true },
      gender: { type: DataTypes.STRING(32), allowNull: true },
      height_cm: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      weight_kg: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      activity_level: { type: DataTypes.STRING(64), allowNull: true },
      preferred_cuisine: { type: DataTypes.STRING(100), allowNull: true },
      profile_data: { type: DataTypes.JSON, allowNull: true },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "patients",
      timestamps: false,
      underscored: true,
    },
  );
