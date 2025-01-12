// db.js
require('dotenv').config();

const knex = require('knex');
const config = require('../knexfile'); // Adjust the path to your knexfile

const environment = process.env.NODE_ENV || 'development';
const knexInstance = knex(config[environment]);

module.exports = knexInstance;