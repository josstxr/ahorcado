const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
<<<<<<< HEAD

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'c0d1g0-s3cr3t';

router.post('/register', async (req, res) => {
  try {
    console.log('POST /api/auth/register recibido con body:', req.body);
=======
const { getJwtSecret } = require('../config/auth');
const { authLimiter } = require('../middleware/security');

const router = express.Router();
const JWT_SECRET = getJwtSecret();

// OWASP Top 10 - A07 Identification and Authentication Failures
// Se aplican límites de peticiones a los endpoints de login y registro para frenar ataques por fuerza bruta.
router.use('/login', authLimiter);
router.use('/register', authLimiter);

// OWASP Top 10 - A03 Injection / A05 Security Misconfiguration
// Se validan los datos de entrada y se evita exponer detalles internos al cliente.
router.post('/register', async (req, res) => {
  console.log(`[AUTH] Registro intento: ${req.ip}`);
  try {
    console.log(`[AUTH] Registro recibido para usuario: ${String(req.body?.name || '').trim()}`);
>>>>>>> 8054e26 (Initial commit)
    
    const name = String(req.body.name || '').trim().slice(0, 30);
    const first_name = String(req.body.first_name || '').trim().slice(0, 50);
    const last_name = String(req.body.last_name || '').trim().slice(0, 50);
    const email = String(req.body.email || '').trim().slice(0, 100).toLowerCase();
    const role = ['student', 'teacher'].includes(req.body.role) ? req.body.role : 'student';
    const password = String(req.body.password || '');

    if (!name || !first_name || !last_name || !email || !password) {
<<<<<<< HEAD
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });
=======
      return res.status(400).json({ error: 'Todos los campos del formulario son obligatorios.' });
    }

    // Validación de formato de email y contraseña
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'El formato del correo electrónico no es válido.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
>>>>>>> 8054e26 (Initial commit)
    }

    const [existingName, existingEmail] = await Promise.all([
      pool.query('SELECT id FROM players WHERE name = $1', [name]),
      pool.query('SELECT id FROM players WHERE email = $1', [email]),
    ]);
<<<<<<< HEAD

    if (existingName.rows.length) return res.status(400).json({ error: 'El nombre ya existe' });
    if (existingEmail.rows.length) return res.status(400).json({ error: 'El correo electronico ya está en uso' });
=======
    
    if (existingName.rows.length > 0 || existingEmail.rows.length > 0) {
      return res.status(400).json({ error: 'El nombre de usuario o el correo electrónico ya están en uso.' });
    }
>>>>>>> 8054e26 (Initial commit)

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
<<<<<<< HEAD
    if (err.code === '23505') {
      return res.status(400).json({ error: 'El nombre o correo ya existe' });
    }
    res.status(500).json({ error: 'Error al registrar usuario: ' + err.message });
  }
});

router.post('/login', async (req, res) => {
=======
    if (err.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'El nombre o correo ya existe' });
    }
    res.status(500).json({ error: 'Error interno al registrar el usuario.' });
  }
});

// OWASP Top 10 - A01 Broken Access Control / A07 Identification and Authentication Failures
// El login verifica credenciales y emite un JWT válido solo si el usuario es quien dice ser.
router.post('/login', async (req, res) => {
  console.log(`[AUTH] Login intento: ${req.ip} -> ${String(req.body?.credential || '').trim()}`);
>>>>>>> 8054e26 (Initial commit)
  try {
    console.log('POST /api/auth/login recibido');
    const credential = String(req.body.credential || req.body.name || req.body.username || req.body.email || '').trim().slice(0, 100);
    const password = String(req.body.password || '');
<<<<<<< HEAD
    if (!credential || !password) return res.status(400).json({ error: 'Usuario/correo y contraseña son obligatorios' });
=======
    if (!credential || !password) return res.status(400).json({ error: 'El usuario/correo y la contraseña son obligatorios.' });
>>>>>>> 8054e26 (Initial commit)

    const userRes = await pool.query(
      'SELECT id, name, first_name, last_name, email, password, role, score FROM players WHERE name = $1 OR email = $2',
      [credential, credential.toLowerCase()]
    );
<<<<<<< HEAD
    if (!userRes.rows.length) return res.status(400).json({ error: 'Usuario o contraseña incorrecta' });
=======
    if (!userRes.rows.length) {
      console.warn(`[AUTH] Login fallido: usuario no encontrado -> ${req.ip}`);
      return res.status(401).json({ error: 'Credenciales incorrectas. Por favor, verifica tu usuario y contraseña.' });
    }
>>>>>>> 8054e26 (Initial commit)

    const user = userRes.rows[0];
    const storedPassword = String(user.password || '');
    let valid = false;

    if (storedPassword.startsWith('$2')) {
      valid = await bcrypt.compare(password, storedPassword);
    } else {
<<<<<<< HEAD
=======
      // Lógica para migrar contraseñas antiguas (no hasheadas)
>>>>>>> 8054e26 (Initial commit)
      valid = storedPassword === password;
      if (valid) {
        const hashed = await bcrypt.hash(password, 10);
        await pool.query('UPDATE players SET password = $1 WHERE id = $2', [hashed, user.id]);
      }
    }

<<<<<<< HEAD
    if (!valid) return res.status(400).json({ error: 'Usuario o contraseña incorrecta' });
=======
    if (!valid) {
      console.warn(`[AUTH] Login fallido: contraseña inválida -> ${req.ip}`);
      return res.status(401).json({ error: 'Credenciales incorrectas. Por favor, verifica tu usuario y contraseña.' });
    }

    console.log(`[AUTH] Login exitoso: ${user.name} (${req.ip})`);
>>>>>>> 8054e26 (Initial commit)

    const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, name: user.name, first_name: user.first_name, last_name: user.last_name, email: user.email, role: user.role, score: user.score } });
  } catch (err) {
    console.error(err);
<<<<<<< HEAD
    res.status(500).json({ error: 'Error al iniciar sesion' });
=======
    res.status(500).json({ error: 'Error interno del servidor al intentar iniciar sesión.' });
>>>>>>> 8054e26 (Initial commit)
  }
});

module.exports = router;
