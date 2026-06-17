const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING || 'postgres://postgres:password@localhost:5432/ahorcado';
const pool = new Pool({ connectionString });

pool.on('error', (err) => {
  console.error('Error inesperado en la conexión a la base de datos', err);
  process.exit(-1);
});

module.exports = { pool };
