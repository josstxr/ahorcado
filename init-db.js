const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const connectionString = process.env.PG_CONNECTION_STRING;
if (!connectionString) {
  console.error('Error: falta PG_CONNECTION_STRING en .env');
  process.exit(1);
}

const sqlPath = path.join(__dirname, 'db', 'init.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const pool = new Pool({ connectionString });

async function main() {
  try {
    console.log('Iniciando la ejecución de db/init.sql...');
    await pool.query(sql);
    console.log('Tablas y datos inicializados correctamente.');
  } catch (err) {
    console.error('Error al inicializar la base de datos:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
