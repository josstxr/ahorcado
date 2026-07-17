const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const connectionString = process.env.PG_CONNECTION_STRING;
if (!connectionString) {
  console.error('Error: falta PG_CONNECTION_STRING en .env');
  process.exit(1);
}

const sqlPath = path.join(__dirname, 'db', 'init.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

// OWASP Top 10 - A02 Cryptographic Failures / A05 Security Misconfiguration
// Se crea el usuario profesor por defecto usando bcrypt y variables de entorno, evitando contraseñas planas en la base de datos.
async function seedDefaultTeacher() {
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

  await pool.query(
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

async function main() {
  try {
    console.log('Iniciando la ejecución de db/init.sql...');
    await pool.query(sql);
    await seedDefaultTeacher();
    console.log('Tablas y datos inicializados correctamente.');
  } catch (err) {
    console.error('Error al inicializar la base de datos:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

