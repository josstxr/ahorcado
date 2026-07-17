const express = require('express');
const path = require('path');
<<<<<<< HEAD
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const wordsRoutes = require('./routes/words');
const dailyWordsRoutes = require('./routes/dailyWords');

const app = express();
const PORT = process.env.PORT || 4000;
=======
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const wordsRoutes = require('./routes/words');
const leaderboardRoutes = require('./routes/leaderboard');
const dailyWordsRoutes = require('./routes/dailyWords');
const { applySecurityHeaders, generalLimiter, securityLogger, enforceHttps } = require('./middleware/security');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// OWASP Top 10 - A05 Security Misconfiguration
// El servidor activa headers de seguridad y middleware central para reducir exposición y abuso de la API.
app.set('trust proxy', 1);
applySecurityHeaders(app);
>>>>>>> 8054e26 (Initial commit)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
<<<<<<< HEAD
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', authRoutes);
app.use('/api', gameRoutes);
=======
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
>>>>>>> 8054e26 (Initial commit)
app.use('/api/words', wordsRoutes);
app.use('/api/daily-words', dailyWordsRoutes);
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
<<<<<<< HEAD
=======
app.use((err, req, res, next) => {
  console.error('[SERVER] Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});
>>>>>>> 8054e26 (Initial commit)

app.listen(PORT, () => {
  console.log(`Ahorcado UTVAM ejecutándose de forma segura en http://localhost:${PORT}`);
});