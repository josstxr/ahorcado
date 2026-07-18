const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || 'postgres://postgres:password@localhost:5432/ahorcado';
const pool = new Pool({
  connectionString,
  ssl: process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Error inesperado en la conexión a la base de datos', err);
});

module.exports = { pool };
