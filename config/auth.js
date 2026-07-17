const crypto = require('crypto');

function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }

  return process.env.JWT_SECRET_DEV || crypto.randomBytes(32).toString('hex');
}

module.exports = { getJwtSecret };
