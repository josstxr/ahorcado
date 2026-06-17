const express = require('express');
const path = require('path');
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const wordsRoutes = require('./routes/words');
const dailyWordsRoutes = require('./routes/dailyWords');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', authRoutes);
app.use('/api', gameRoutes);
app.use('/api/words', wordsRoutes);
app.use('/api/daily-words', dailyWordsRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Ahorcado maquiav�lico escuchando en http://localhost:${PORT}`);
});
