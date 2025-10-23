const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Order = sequelize.define('Order', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  passengerId: DataTypes.INTEGER,
  driverId: DataTypes.INTEGER,
  startLat: DataTypes.FLOAT,
  startLng: DataTypes.FLOAT,
  endLat: DataTypes.FLOAT,
  endLng: DataTypes.FLOAT,
  fare: DataTypes.FLOAT,
  status: { type: DataTypes.STRING, defaultValue: 'pending' }, // pending, accepted, onboard, in_progress, completed
  startTime: DataTypes.DATE,
  endTime: DataTypes.DATE
});

module.exports = Order;
