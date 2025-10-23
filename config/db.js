const { Sequelize } = require('sequelize');
const sequelize = new Sequelize('ride_hailing', 'username', 'password', {
  host: 'localhost',
  dialect: 'mysql',
});

module.exports = sequelize;
