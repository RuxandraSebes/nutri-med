const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "ClinicalConstraint",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      record_id: { type: DataTypes.INTEGER, allowNull: false },
      type: {
        type: DataTypes.ENUM("allergy", "restriction"),
        allowNull: false,
      },
      value: { type: DataTypes.STRING(255), allowNull: false },
    },
    {
      tableName: "clinical_constraints",
      timestamps: false,
      underscored: true,
    },
  );

