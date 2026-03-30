const { Sequelize } = require("sequelize");

const MYSQL_HOST = process.env.MYSQL_HOST || "localhost";
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_DB = process.env.MYSQL_DB || "nutrimed";
const MYSQL_USER = process.env.MYSQL_USER || "root";
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || "";

const sequelize = new Sequelize(MYSQL_DB, MYSQL_USER, MYSQL_PASSWORD, {
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  dialect: "mysql",
  logging: false,
});

const MedicalRecord = require("./medicalRecord")(sequelize);
const BodyComposition = require("./bodyComposition")(sequelize);
const ClinicalConstraint = require("./clinicalConstraint")(sequelize);

MedicalRecord.hasOne(BodyComposition, {
  foreignKey: "record_id",
  as: "body_composition",
});
BodyComposition.belongsTo(MedicalRecord, { foreignKey: "record_id" });

MedicalRecord.hasMany(ClinicalConstraint, {
  foreignKey: "record_id",
  as: "clinical_constraints",
});
ClinicalConstraint.belongsTo(MedicalRecord, { foreignKey: "record_id" });

module.exports = {
  sequelize,
  MedicalRecord,
  BodyComposition,
  ClinicalConstraint,
};

