const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'c0d1g0-s3cr3t';

router.post('/register', async (req, res) => {
  try {
    console.log('POST /api/auth/register recibido con body:', req.body);
    
    const name = String(req.body.name || '').trim().slice(0, 30);
    const first_name = String(req.body.first_name || '').trim().slice(0, 50);
    const last_name = String(req.body.last_name || '').trim().slice(0, 50);
    const email = String(req.body.email || '').trim().slice(0, 100).toLowerCase();
    const role = ['student', 'teacher'].includes(req.body.role) ? req.body.role : 'student';
    const password = String(req.body.password || '');

    if (!name || !first_name || !last_name || !email || !password) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    const [existingName, existingEmail] = await Promise.all([
      pool.query('SELECT id FROM players WHERE name = $1', [name]),
      pool.query('SELECT id FROM players WHERE email = $1', [email]),
    ]);

    if (existingName.rows.length) return res.status(400).json({ error: 'El nombre ya existe' });
    if (existingEmail.rows.length) return res.status(400).json({ error: 'El correo electrónico ya está en uso' });

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
    if (err.code === '23505') {
      return res.status(400).json({ error: 'El nombre o correo ya existe' });
    }
    res.status(500).json({ error: 'Error al registrar usuario: ' + err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    console.log('POST /api/auth/login recibido');
    const credential = String(req.body.credential || req.body.name || req.body.username || req.body.email || '').trim().slice(0, 100);
    const password = String(req.body.password || '');
    if (!credential || !password) return res.status(400).json({ error: 'Usuario/correo y contraseña son obligatorios' });

    const userRes = await pool.query(
      'SELECT id, name, first_name, last_name, email, password, role, score FROM players WHERE name = $1 OR email = $2',
      [credential, credential.toLowerCase()]
    );
    if (!userRes.rows.length) return res.status(400).json({ error: 'Usuario o contraseña incorrecta' });

    const user = userRes.rows[0];
    const storedPassword = String(user.password || '');
    let valid = false;

    if (storedPassword.startsWith('$2')) {
      valid = await bcrypt.compare(password, storedPassword);
    } else {
      valid = storedPassword === password;
      if (valid) {
        const hashed = await bcrypt.hash(password, 10);
        await pool.query('UPDATE players SET password = $1 WHERE id = $2', [hashed, user.id]);
      }
    }

    if (!valid) return res.status(400).json({ error: 'Usuario o contraseña incorrecta' });

    const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, name: user.name, first_name: user.first_name, last_name: user.last_name, email: user.email, role: user.role, score: user.score } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

module.exports = router;
