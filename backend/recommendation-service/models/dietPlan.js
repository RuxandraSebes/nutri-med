const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "DietPlan",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      patient_id: { type: DataTypes.INTEGER, allowNull: false },
      specialist_id: { type: DataTypes.INTEGER, allowNull: true },
      status: {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "pending",
      },
      clinical_strategy: { type: DataTypes.TEXT, allowNull: true },
      meal_matrix: { type: DataTypes.JSON, allowNull: true },
      shopping_list: { type: DataTypes.JSON, allowNull: true },
      llm_outputs: { type: DataTypes.JSON, allowNull: true },
      target_macros: { type: DataTypes.JSON, allowNull: true },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "diet_plans",
      timestamps: false,
      underscored: true,
    },
  );

