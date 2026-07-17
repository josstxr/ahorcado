const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/auth');

const JWT_SECRET = getJwtSecret();

function authToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.sendStatus(401); // Unauthorized
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.sendStatus(403); // Forbidden (token is no longer valid)
    }
    req.user = user;
    next();
  });
}

function requireTeacher(req, res, next) {
  if (req.user?.role !== 'teacher') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de profesor.' });
  }
  next();
}

module.exports = { authToken, requireTeacher };