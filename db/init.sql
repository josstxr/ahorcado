-- 1. Tabla de Usuarios/Jugadores
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(200) NOT NULL DEFAULT '',
    role VARCHAR(10) NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
    score INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Tabla de Palabras Banco
CREATE TABLE IF NOT EXISTS words (
    id SERIAL PRIMARY KEY,
    word TEXT UNIQUE NOT NULL,
    difficulty VARCHAR(10) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    created_by INTEGER REFERENCES players(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Tabla de Partidas de Ahorcado Tradicional
CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    word_id INTEGER NOT NULL REFERENCES words(id),
    difficulty VARCHAR(10) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    guessed TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    wrong TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    wrong_attempts INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(10) NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'won', 'lost')),
    revealed_hint VARCHAR(1),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    finished_at TIMESTAMP WITH TIME ZONE
);

-- 4. Tabla de Control de la Palabra del Día
CREATE TABLE IF NOT EXISTS daily_words (
    id SERIAL PRIMARY KEY,
    word_id INTEGER NOT NULL REFERENCES words(id),
    set_by INTEGER NOT NULL REFERENCES players(id) ON DELETE SET NULL,
    set_date DATE NOT NULL DEFAULT CURRENT_DATE,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Tabla de Respuestas para el Desafío de Velocidad (Palabra del Día)
CREATE TABLE IF NOT EXISTS daily_word_answers (
    id SERIAL PRIMARY KEY,
    daily_word_id INTEGER NOT NULL REFERENCES daily_words(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    answer_letter VARCHAR(1) NOT NULL,
    response_time_ms INTEGER NOT NULL,
    points_earned INTEGER NOT NULL DEFAULT 0,
    is_correct BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(daily_word_id, player_id)
);

-- =========================================================
-- DATA SEMILLA (INSERCIONES INICIALES)
-- =========================================================

-- Insertar profesor por defecto (Contraseña plana provisional, idealmente hasheada en producción)
INSERT INTO players (name, first_name, last_name, email, password, role) VALUES
    ('profesor', 'Admin', 'Profesor', 'profesor@ahorcado.local', 'admin123', 'teacher')
ON CONFLICT (name) DO NOTHING;

-- Banco de palabras iniciales
INSERT INTO words (word, difficulty) VALUES
    ('gato','easy'),
    ('casa','easy'),
    ('sol','easy'),
    ('papel','easy'),
    ('raton','easy'),
    ('muerte','medium'),
    ('traicion','medium'),
    ('fantasma','medium'),
    ('laberinto','medium'),
    ('vampiro','medium'),
    ('espionaje','hard'),
    ('conspiracion','hard'),
    ('enigmatico','hard'),
    ('venganza','hard'),
    ('masacre','hard')
ON CONFLICT (word) DO NOTHING;