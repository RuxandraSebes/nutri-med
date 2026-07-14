const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "JournalReview",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      patient_id: { type: DataTypes.INTEGER, allowNull: false },
      specialist_id: { type: DataTypes.INTEGER, allowNull: true },
      status: {
        type: DataTypes.ENUM("pending", "approved"),
        allowNull: false,
        defaultValue: "pending",
      },
      score: { type: DataTypes.INTEGER, allowNull: true },
      food_notes: { type: DataTypes.JSON, allowNull: true },
      diary_snapshot: { type: DataTypes.TEXT, allowNull: true },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "journal_reviews",
      timestamps: false,
      underscored: true,
    },
  );
