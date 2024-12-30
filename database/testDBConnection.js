require('dotenv').config();
const { Pool } = require('pg');

// Configure the PostgreSQL connection
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: {
        rejectUnauthorized: false, // Required for Digital Ocean managed databases
    },
});

// Test connection and create a table
const testConnection = async () => {
    try {
        const client = await pool.connect();
        console.log('Connected to the database');

        // Test creating a table
        const createTableQuery = `
      CREATE TABLE IF NOT EXISTS test_table (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
        await client.query(createTableQuery);
        console.log('Test table created or already exists');

        // Close connection
        client.release();
    } catch (err) {
        console.error('Error connecting to the database:', err.stack);
    } finally {
        pool.end();
    }
};

testConnection();