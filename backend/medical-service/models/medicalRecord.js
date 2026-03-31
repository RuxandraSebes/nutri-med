const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "MedicalRecord",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      patient_id: { type: DataTypes.INTEGER, allowNull: false },
      primary_disease: { type: DataTypes.STRING(255), allowNull: true },
      severity: { type: DataTypes.STRING(32), allowNull: true },
      systolic_bp: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      diastolic_bp: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      glucose: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      cholesterol: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      nutrient_imbalance_score: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      specialist_form_json: { type: DataTypes.JSON, allowNull: true },
      recorded_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "medical_records",
      timestamps: false,
      underscored: true,
    },
  );

