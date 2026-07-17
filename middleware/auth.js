const jwt = require('jsonwebtoken');
<<<<<<< HEAD

const JWT_SECRET = process.env.JWT_SECRET || 'c0d1g0-s3cr3t';
=======
const { getJwtSecret } = require('../config/auth');

const JWT_SECRET = getJwtSecret();
>>>>>>> 8054e26 (Initial commit)

function authToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

module.exports = { authToken };
