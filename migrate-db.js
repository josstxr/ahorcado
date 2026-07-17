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
<<<<<<< HEAD
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
=======
  const client = await pool.connect();
  try {
    console.log('Iniciando la verificación y migración del esquema de la base de datos...');

    // 1. Verificar y añadir columnas faltantes
    const res = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'players'
    `);
    const existingColumns = new Set(res.rows.map(row => row.column_name));

    console.log('\nVerificando columnas en la tabla "players":');
    const columnsToAdd = [
      { name: 'first_name', def: "VARCHAR(50) NOT NULL DEFAULT 'Usuario'" },
      { name: 'last_name', def: "VARCHAR(50) NOT NULL DEFAULT 'Registrado'" },
      { name: 'email', def: 'VARCHAR(100)' }, // Se hará NOT NULL más adelante
      { name: 'password', def: "VARCHAR(200) NOT NULL DEFAULT ''" },
      { name: 'role', def: "VARCHAR(10) NOT NULL DEFAULT 'student'" },
      { name: 'score', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'created_at', def: 'TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()' },
    ];

    for (const col of columnsToAdd) {
      if (!existingColumns.has(col.name)) {
        try {
          await client.query(`ALTER TABLE players ADD COLUMN ${col.name} ${col.def}`);
          console.log(`✓ Columna "${col.name}" agregada.`);
        } catch (err) {
          console.error(`✗ Error al agregar la columna "${col.name}": ${err.message}`);
        }
      } else {
        console.log(`ℹ Columna "${col.name}" ya existe.`);
      }
    }

    // 2. Migraciones de datos (para registros antiguos)
    console.log('\nActualizando datos de registros existentes...');
    
    // Generar emails únicos para usuarios que no lo tengan
    await client.query(`
      UPDATE players SET email = COALESCE(email, name || '@ahorcado.local') WHERE email IS NULL OR email = '';
    `);
    console.log('✓ Emails por defecto asignados a usuarios antiguos.');

    // 3. Aplicar restricciones y índices
    console.log('\nAplicando restricciones e índices...');

    try {
      await client.query(`ALTER TABLE players ALTER COLUMN email SET NOT NULL;`);
      console.log('✓ Restricción NOT NULL aplicada a "email".');
    } catch (err) {
      // Ignorar si ya está aplicada o si hay valores nulos (aunque el paso anterior debería prevenirlo)
      console.log('ℹ "email" ya es NOT NULL o no se pudo aplicar.');
    }

    try {
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS players_email_unique ON players(email);`);
      console.log('✓ Índice único en "email" asegurado.');
    } catch (err) {
      // Puede fallar si hay emails duplicados de antes de la migración
      console.error('✗ No se pudo crear el índice único en "email". Puede que existan correos duplicados.');
    }
    
    console.log('\n✅ Migración completada exitosamente');
  } catch (err) {
    console.error('❌ Error fatal durante la migración:', err.message);
    process.exit(1);
  } finally {
    client.release();
>>>>>>> 8054e26 (Initial commit)
    await pool.end();
  }
}

migrate();
