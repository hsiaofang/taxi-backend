const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lineId: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true
  },
  lineName: DataTypes.STRING,
  linePicture: DataTypes.STRING,

  phone: DataTypes.STRING,
  passwordHash: DataTypes.STRING,
});