const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { authLimiter } = require('../middleware/security');
const { getJwtSecret } = require('../config/auth');

const router = express.Router();
const JWT_SECRET = getJwtSecret();
const VALID_ROLES = new Set(['student', 'teacher']);

// OWASP Top 10 - A07 Identification and Authentication Failures
// Se aplican límites de peticiones a los endpoints de login y registro para frenar ataques por fuerza bruta.
router.use('/login', authLimiter);
router.use('/register', authLimiter);

router.post('/register', async (req, res) => {
  try {
    console.log(`[AUTH] Registro intento para usuario: ${String(req.body?.name || '').trim()}`);

    if (!process.env.PG_CONNECTION_STRING && !process.env.DATABASE_URL && !process.env.POSTGRES_URL && !process.env.POSTGRES_PRISMA_URL) {
      return res.status(503).json({ error: 'La base de datos no está configurada. El registro no está disponible.' });
    }

    const name = String(req.body.name || '').trim().slice(0, 30);
    const first_name = String(req.body.first_name || '').trim().slice(0, 50);
    const last_name = String(req.body.last_name || '').trim().slice(0, 50);
    const email = String(req.body.email || '').trim().slice(0, 100).toLowerCase();
    const role = String(req.body.role || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!name || !first_name || !last_name || !email || !password) {
      return res.status(400).json({ error: 'Todos los campos del formulario son obligatorios.' });
    }
    if (!VALID_ROLES.has(role)) {
      return res.status(400).json({ error: 'Selecciona explícitamente si la cuenta será Alumno o Profesor.' });
    }

    // Validación de formato de email y contraseña
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'El formato del correo electrónico no es válido.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const [existingName, existingEmail] = await Promise.all([
      pool.query('SELECT id FROM players WHERE name = $1', [name]),
      pool.query('SELECT id FROM players WHERE email = $1', [email]),
    ]);
    
    if (existingName.rows.length > 0 || existingEmail.rows.length > 0) {
      return res.status(400).json({ error: 'El nombre de usuario o el correo electrónico ya están en uso.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const insert = await pool.query(
      'INSERT INTO players (name, first_name, last_name, email, password, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, first_name, last_name, email, role, score',
      [name, first_name, last_name, email, hashed, role]
    );

    const user = insert.rows[0];
    const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    console.log('Usuario registrado:', user.name);
    res.json({ token, user });
  } catch (err) {
    console.error('Error en /register:', err.message, err);
    if (err.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'El nombre o correo ya existe' });
    }
    res.status(500).json({ error: 'Error interno al registrar el usuario.' });
  }
});

// OWASP Top 10 - A01 Broken Access Control / A07 Identification and Authentication Failures
// El login verifica credenciales y emite un JWT válido solo si el usuario es quien dice ser.
router.post('/login', async (req, res) => {
  try {
    console.log(`[AUTH] Login intento: ${req.ip} -> ${String(req.body?.credential || '').trim()}`);

    if (!process.env.PG_CONNECTION_STRING && !process.env.DATABASE_URL && !process.env.POSTGRES_URL && !process.env.POSTGRES_PRISMA_URL) {
      return res.status(503).json({ error: 'La base de datos no está configurada en producción. Contacta al administrador.' });
    }

    const credential = String(req.body.credential || req.body.name || req.body.username || req.body.email || '').trim().slice(0, 100);
    const password = String(req.body.password || '');
    if (!credential || !password) return res.status(400).json({ error: 'El usuario/correo y la contraseña son obligatorios.' });

    const userRes = await pool.query(
      'SELECT id, name, first_name, last_name, email, password, role, score FROM players WHERE name = $1 OR email = $2',
      [credential, credential.toLowerCase()]
    );
    if (!userRes.rows.length) {
      console.warn(`[AUTH] Login fallido: usuario no encontrado -> ${req.ip}`);
      return res.status(401).json({ error: 'Credenciales incorrectas. Por favor, verifica tu usuario y contraseña.' });
    }

    const user = userRes.rows[0];
    const storedPassword = String(user.password || '');
    let valid = false;

    if (storedPassword.startsWith('$2')) {
      valid = await bcrypt.compare(password, storedPassword);
    } else {
      // Lógica para migrar contraseñas antiguas (no hasheadas)
      valid = storedPassword === password;
      if (valid) {
        const hashed = await bcrypt.hash(password, 10);
        await pool.query('UPDATE players SET password = $1 WHERE id = $2', [hashed, user.id]);
      }
    }

    if (!valid) {
      console.warn(`[AUTH] Login fallido: contraseña inválida -> ${req.ip}`);
      return res.status(401).json({ error: 'Credenciales incorrectas. Por favor, verifica tu usuario y contraseña.' });
    }

    console.log(`[AUTH] Login exitoso: ${user.name} (${req.ip})`);

    const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, name: user.name, first_name: user.first_name, last_name: user.last_name, email: user.email, role: user.role, score: user.score } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor al intentar iniciar sesión.' });
  }
});

router.delete('/me', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sesión no válida.' });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Sesión expirada. Inicia sesión otra vez.' });
  }

  const password = String(req.body.password || '');
  if (!password) return res.status(400).json({ error: 'Ingresa tu contraseña para eliminar la cuenta.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT id, password FROM players WHERE id = $1',
      [decoded.id]
    );
    if (!userResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'La cuenta ya no existe.' });
    }

    const user = userResult.rows[0];
    const storedPassword = String(user.password || '');
    const validPassword = storedPassword.startsWith('$2')
      ? await bcrypt.compare(password, storedPassword)
      : storedPassword === password;

    if (!validPassword) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }

    await client.query('DELETE FROM daily_word_answers WHERE player_id = $1', [decoded.id]);
    await client.query('UPDATE daily_words SET set_by = NULL WHERE set_by = $1', [decoded.id]);
    await client.query('UPDATE words SET created_by = NULL WHERE created_by = $1', [decoded.id]);
    await client.query('DELETE FROM games WHERE player_id = $1', [decoded.id]);
    await client.query('DELETE FROM assigned_games WHERE teacher_id = $1 OR student_id = $1', [decoded.id]);
    await client.query('DELETE FROM players WHERE id = $1', [decoded.id]);

    await client.query('COMMIT');
    res.json({ message: 'Cuenta eliminada permanentemente.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting account:', err);
    res.status(500).json({ error: 'Error al eliminar la cuenta.' });
  } finally {
    client.release();
  }
});

module.exports = router;
