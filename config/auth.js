function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in .env file.');
    process.exit(1);
  }
  return secret;
}

module.exports = { getJwtSecret };