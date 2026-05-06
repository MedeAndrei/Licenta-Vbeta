const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('Licenta_IMM', 'postgres', 'spaniola123', {
    host: 'localhost',
    dialect: 'postgres'
});

module.exports = sequelize;