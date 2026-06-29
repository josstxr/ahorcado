const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const connectionString = process.env.PG_CONNECTION_STRING;
if (!connectionString) {
  console.error('Error: falta PG_CONNECTION_STRING en .env');
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function migrate() {
  try {
    console.log('Iniciando migración de todas las columnas...\n');

    const queries = [
      { name: 'password', sql: "ALTER TABLE players ADD COLUMN password VARCHAR(200) DEFAULT 'admin123';" },
      { name: 'first_name', sql: "ALTER TABLE players ADD COLUMN first_name VARCHAR(50) DEFAULT 'Usuario';" },
      { name: 'last_name', sql: "ALTER TABLE players ADD COLUMN last_name VARCHAR(50) DEFAULT 'Registrado';" },
      { name: 'email', sql: "ALTER TABLE players ADD COLUMN email VARCHAR(100);" },
      { name: 'role', sql: "ALTER TABLE players ADD COLUMN role VARCHAR(10) DEFAULT 'student';" },
      { name: 'score', sql: "ALTER TABLE players ADD COLUMN score INTEGER DEFAULT 0;" },
      { name: 'created_at', sql: "ALTER TABLE players ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT now();" },
    ];

    for (const query of queries) {
      try {
        await pool.query(query.sql);
        console.log(`✓ Columna ${query.name} agregada`);
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`ℹ Columna ${query.name} ya existe`);
        } else {
          console.error(`✗ Error en ${query.name}: ${err.message}`);
        }
      }
    }

    console.log('\nActualizando registros existentes...');
    
    // Generar emails únicos
    await pool.query(`
      UPDATE players SET email = COALESCE(email, name || '@ahorcado.local') WHERE email IS NULL OR email = '';
    `);
    console.log('✓ Emails asignados');

    // Hacer NOT NULL las columnas críticas
    try {
      await pool.query(`ALTER TABLE players ALTER COLUMN email SET NOT NULL;`);
      console.log('✓ email: NOT NULL');
    } catch (err) {
      console.log('ℹ email ya es NOT NULL o hay conflicto:', err.message.split('\n')[0]);
    }

    try {
      await pool.query(`ALTER TABLE players ALTER COLUMN password SET NOT NULL;`);
      console.log('✓ password: NOT NULL');
    } catch (err) {
      console.log('ℹ password ya es NOT NULL');
    }

    // Crear índice único para email si no existe
    try {
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS players_email_unique ON players(email);`);
      console.log('✓ Índice único en email creado');
    } catch (err) {
      console.log('ℹ Índice ya existe');
    }

    console.log('\n✅ Migración completada exitosamente');
  } catch (err) {
    console.error('❌ Error en migración:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
