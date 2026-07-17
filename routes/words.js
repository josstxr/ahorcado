const express = require('express');
const { pool } = require('../db');
const { authToken } = require('../middleware/auth');

const router = express.Router();

// OWASP Top 10 - A01 Broken Access Control / A05 Security Misconfiguration
// Solo los profesores pueden consultar o agregar palabras, y el acceso se valida en el servidor.

router.get('/', authToken, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Solo profesores pueden ver las palabras' });
    }

    const result = await pool.query(
      'SELECT id, word, difficulty FROM words ORDER BY difficulty, word'
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching words:', err);
    res.status(500).json({ error: 'Error cargando las palabras' });
  }
});

// OWASP Top 10 - A03 Injection
// Se validan los tipos de entrada y se sanitiza la palabra para evitar caracteres maliciosos.

router.post('/', authToken, async (req, res) => {
  try {
    // SEGURIDAD: No loguear el objeto 'req.user' completo para evitar la fuga de datos sensibles (como hashes de contraseñas)
    console.log('Request to add word:', { userId: req.user.id, role: req.user.role });
    
    // Control de acceso por rol
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Solo profesores pueden añadir palabras' });
    }

    // SEGURIDAD: Validación estricta del tipo de dato entrante
    if (typeof req.body.word !== 'string') {
      return res.status(400).json({ error: 'La palabra debe ser un formato de texto válido' });
    }

    const word = req.body.word.trim().toLowerCase();
    const difficulty = ['easy', 'medium', 'hard'].includes(req.body.difficulty) ? req.body.difficulty : null;

    // SEGURIDAD: Sanitización por Expresión Regular. 
    // Asegura que la palabra contenga ÚNICAMENTE letras (incluyendo eñes, acentos y diéresis), evitando caracteres especiales o scripts.
    const validWordRegex = /^[a-zñáéíóúü]+$/;

    if (!word || !difficulty) {
      return res.status(400).json({ error: 'Palabra y dificultad son obligatorios' });
    }

    if (!validWordRegex.test(word)) {
      return res.status(400).json({ error: 'La palabra solo debe contener letras válidas, sin números ni caracteres especiales' });
    }

    // Inserción segura mediante consultas parametrizadas
    await pool.query(
      'INSERT INTO words (word, difficulty, created_by) VALUES ($1, $2, $3)', 
      [word, difficulty, req.user.id]
    );

    res.json({ message: 'Palabra agregada correctamente' });
  } catch (err) {
    console.error('Error adding word:', err);

    // Manejo seguro del error de clave duplicada (PostgreSQL error code 23505)
    if (err.code === '23505') {
      return res.status(400).json({ error: 'La palabra ya existe en el sistema' });
    }
    
    // SEGURIDAD: No exponer 'err.message' directamente al cliente para no revelar detalles internos de la base de datos
    res.status(500).json({ error: 'Error interno al agregar la palabra' });
  }
});

// --- NUEVA FUNCIONALIDAD: GENERACIÓN DE PALABRAS CON IA ---

// OWASP Top 10 - A01 Broken Access Control
// Solo los profesores pueden generar palabras mediante IA.
router.post('/generate-by-theme', authToken, async (req, res) => {
  // NOTA: Para que esto funcione, debes instalar 'openai' con `npm install openai`
  // y configurar tu clave de API en un archivo .env como OPENAI_API_KEY=sk-xxxx
  // const { OpenAI } = require("openai");
  // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const client = await pool.connect();
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Solo profesores pueden generar palabras con IA' });
    }

    const { theme, difficulty, count = 5 } = req.body;
    if (typeof theme !== 'string' || !theme.trim()) {
      return res.status(400).json({ error: 'El tema es obligatorio y debe ser texto.' });
    }
    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      return res.status(400).json({ error: 'La dificultad debe ser easy, medium, o hard.' });
    }

    // --- Lógica de IA (Ejemplo Conceptual) ---
    const prompt = `Genera una lista de ${count} palabras en español para un juego de ahorcado.
El tema es "${theme}" y la dificultad es "${difficulty}".
Las palabras deben ser únicas, de una sola palabra, sin espacios ni caracteres especiales, y solo en minúsculas.
Responde únicamente con un objeto JSON que tenga una clave "words" que contenga un array de las palabras.
Ejemplo de respuesta: {"words": ["palabra1", "palabra2"]}`;

    // --- Descomenta el siguiente bloque para usar la API real de OpenAI ---
    /*
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const result = JSON.parse(response.choices[0].message.content);
    const words = result.words || [];
    */

    // --- Bloque de simulación para pruebas sin API Key ---
    console.warn('AI generation is mocked. Using placeholder data.');
    const words = theme === 'espacio' ? ['nebulosa', 'supernova', 'quasar', 'astronauta', 'galaxia'] : ['concepto', 'ejemplo', 'prueba', 'maqueta', 'demostracion'];
    // --- Fin del bloque de simulación ---

    if (!words || words.length === 0) {
      return res.status(500).json({ error: 'No se pudieron generar palabras desde la IA.' });
    }

    // Insertar palabras en la base de datos de forma segura
    await client.query('BEGIN');
    let insertedCount = 0;
    const validWordRegex = /^[a-zñáéíóúü]+$/;

    for (const word of words) {
      if (validWordRegex.test(word)) {
        const insertResult = await client.query(
          `INSERT INTO words (word, difficulty, created_by) VALUES ($1, $2, $3) ON CONFLICT (word) DO NOTHING RETURNING id`,
          [word, difficulty, req.user.id]
        );
        if (insertResult.rowCount > 0) insertedCount++;
      }
    }
    await client.query('COMMIT');
    res.json({ message: `Se generaron y agregaron ${insertedCount} nuevas palabras sobre "${theme}" con dificultad ${difficulty}.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error generating words with AI:', err);
    res.status(500).json({ error: 'Error interno al generar palabras con IA.' });
  } finally {
    client.release();
  }
});

module.exports = router;