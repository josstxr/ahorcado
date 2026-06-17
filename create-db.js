const { Pool } = require('pg');
const dotenv = require('dotenv');
const { URL } = require('url');

dotenv.config();

const connectionString = process.env.PG_CONNECTION_STRING;
if (!connectionString) {
  console.error('Error: falta PG_CONNECTION_STRING en .env');
  process.exit(1);
}

let adminUrl;
try {
  adminUrl = new URL(connectionString);
} catch (err) {
  console.error('Error: la cadena PG_CONNECTION_STRING no es válida.');
  console.error(err.message);
  process.exit(1);
}

const dbName = adminUrl.pathname.replace(/\//g, '') || 'ahorcado';
adminUrl.pathname = '/postgres';

const pool = new Pool({ connectionString: adminUrl.toString() });

async function main() {
  try {
    const result = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (result.rowCount > 0) {
      console.log(`La base de datos '${dbName}' ya existe.`);
      return;
    }

    const safeName = dbName.replace(/"/g, '""');
    await pool.query(`CREATE DATABASE "${safeName}"`);
    console.log(`Base de datos '${dbName}' creada correctamente.`);
  } catch (error) {
    console.error('No se pudo crear la base de datos:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
