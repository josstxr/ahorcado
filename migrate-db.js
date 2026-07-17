const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const connectionString = process.env.PG_CONNECTION_STRING;
if (!connectionString) {
  console.error('Error: falta PG_CONNECTION_STRING en .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
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

    await client.query("ALTER TABLE words ADD COLUMN IF NOT EXISTS theme VARCHAR(50) NOT NULL DEFAULT 'General'");
    console.log('✓ Soporte para temas agregado al banco de palabras.');

    await client.query(`
      CREATE TABLE IF NOT EXISTS assigned_games (
        id SERIAL PRIMARY KEY,
        teacher_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        theme VARCHAR(50) NOT NULL DEFAULT 'General',
        difficulty VARCHAR(10) NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
        word_ids INTEGER[] NOT NULL,
        current_index INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','playing','completed')),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
      ALTER TABLE games ADD COLUMN IF NOT EXISTS assigned_game_id INTEGER REFERENCES assigned_games(id) ON DELETE SET NULL;
    `);
    console.log('✓ Soporte para partidas asignadas agregado.');

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
    await pool.end();
  }
}

migrate();
