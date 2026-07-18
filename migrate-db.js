const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const connectionString = process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
if (!connectionString) {
  console.error('Error: falta PG_CONNECTION_STRING, DATABASE_URL, POSTGRES_URL o POSTGRES_PRISMA_URL en .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const initSqlPath = path.join(__dirname, 'db', 'init.sql');
const initSql = fs.readFileSync(initSqlPath, 'utf8');

async function seedDefaultTeacher(client) {
  const teacherPassword = process.env.DEFAULT_TEACHER_PASSWORD;
  if (!teacherPassword) {
    console.warn('DEFAULT_TEACHER_PASSWORD no configurada. Se omite la creación del profesor por defecto.');
    return;
  }

  const teacherName = process.env.DEFAULT_TEACHER_NAME || 'profesor';
  const teacherFirstName = process.env.DEFAULT_TEACHER_FIRST_NAME || 'Admin';
  const teacherLastName = process.env.DEFAULT_TEACHER_LAST_NAME || 'Profesor';
  const teacherEmail = process.env.DEFAULT_TEACHER_EMAIL || 'profesor@ahorcado.local';
  const hashedPassword = await bcrypt.hash(teacherPassword, 10);

  await client.query(
    `INSERT INTO players (name, first_name, last_name, email, password, role)
     VALUES ($1, $2, $3, $4, $5, 'teacher')
     ON CONFLICT (name) DO UPDATE SET
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       email = EXCLUDED.email,
       password = EXCLUDED.password,
       role = EXCLUDED.role`,
    [teacherName, teacherFirstName, teacherLastName, teacherEmail, hashedPassword]
  );

  console.log('Profesor por defecto inicializado con contraseña hasheada.');
}

async function ensureBaseSchema(client) {
  const res = await client.query(`SELECT to_regclass('public.players') AS table_exists`);
  if (res.rows[0]?.table_exists) {
    return false;
  }

  console.log('La tabla "players" no existe. Inicializando el esquema base...');
  await client.query(initSql);
  await seedDefaultTeacher(client);
  console.log('Esquema base inicializado correctamente.');
  return true;
}

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Iniciando la verificación y migración del esquema de la base de datos...');

    const initialized = await ensureBaseSchema(client);
    if (initialized) {
      console.log('El esquema base ya fue creado. Continuando con la migración de columnas...');
    }

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

    await client.query('ALTER TABLE words ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES players(id) ON DELETE SET NULL');
    console.log('✓ Autor de palabras agregado al banco de palabras.');

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_words (
        id SERIAL PRIMARY KEY,
        word_id INTEGER NOT NULL REFERENCES words(id),
        set_by INTEGER REFERENCES players(id) ON DELETE SET NULL,
        set_date DATE NOT NULL DEFAULT CURRENT_DATE,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS daily_word_answers (
        id SERIAL PRIMARY KEY,
        daily_word_id INTEGER NOT NULL REFERENCES daily_words(id) ON DELETE CASCADE,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        answer_letter VARCHAR(1) NOT NULL,
        response_time_ms INTEGER NOT NULL,
        points_earned INTEGER NOT NULL DEFAULT 0,
        is_correct BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        UNIQUE(daily_word_id, player_id)
      );
    `);
    await client.query('ALTER TABLE daily_words ALTER COLUMN set_by DROP NOT NULL');
    console.log('✓ Soporte para Palabra del Día agregado.');

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
