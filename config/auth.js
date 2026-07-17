function getJwtSecret() {
  const secret = process.env.JWT_SECRET || 'development-secret';
  if (!process.env.JWT_SECRET) {
    console.warn('JWT_SECRET no definido; se usará un valor temporal de desarrollo.');
  }
  return secret;
}

module.exports = { getJwtSecret };