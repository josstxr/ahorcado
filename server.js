const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const wordsRoutes = require('./routes/words');
const leaderboardRoutes = require('./routes/leaderboard');
const dailyWordsRoutes = require('./routes/dailyWords');
const assignmentsRoutes = require('./routes/assignments');
const { applySecurityHeaders, generalLimiter, securityLogger, enforceHttps } = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 4000;

// OWASP Top 10 - A05 Security Misconfiguration
// El servidor activa headers de seguridad y middleware central para reducir exposición y abuso de la API.
app.set('trust proxy', 1);
applySecurityHeaders(app);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(enforceHttps);
app.use(securityLogger);
app.use(generalLimiter);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/words', wordsRoutes);
app.use('/api/daily-words', dailyWordsRoutes);
app.use('/api/assignments', assignmentsRoutes);
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use((err, req, res, next) => {
  console.error('[SERVER] Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`Ahorcado UTVAM ejecutándose de forma segura en http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Error: El puerto ${PORT} ya está en uso.`);
      console.error('Asegúrate de que no haya otra instancia del servidor ejecutándose o cambia el puerto en tu archivo .env.');
    } else {
      console.error(`[SERVER] Error al iniciar: ${err.message}`);
    }
    process.exit(1);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = app;
