# Ahorcado UTVAM

Juego educativo de ahorcado para alumnos y profesores, creado con Express, PostgreSQL y JavaScript modular.

## Funciones

- Perfiles de alumno y profesor con autenticación JWT.
- Juego tradicional con seis intentos, dibujo animado del ahorcado y teclado visual.
- Sonidos para aciertos, errores, victoria y derrota.
- Celebración y mensaje de felicitación al descubrir la palabra.
- Dificultades fácil, media y difícil.
- Banco de palabras organizado por temas.
- Filtros por texto y tema para profesores.
- Selección manual de palabras para partidas temáticas.
- Asignación de una partida a uno o varios alumnos.
- Selector de actividades pendientes para cada alumno.
- Partidas libres con palabras aleatorias según la dificultad.
- Generación opcional de palabras mediante Google Gemini.
- Palabra del día, clasificación y puntuaciones.
- Modo claro y oscuro con interfaz Liquid Glass responsive.

## Instalación

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Copia la configuración:

   ```bash
   cp .env.example .env
   ```

3. Configura como mínimo `PG_CONNECTION_STRING` y `JWT_SECRET`.

4. Inicializa una instalación nueva:

   ```bash
   npm run init-db
   ```

   Para una base existente, aplica las nuevas columnas con:

   ```bash
   npm run migrate-db
   ```

5. Inicia la aplicación:

   ```bash
   npm start
   ```

6. Visita `http://localhost:4000`.

## Generación con IA

Agrega `GEMINI_API_KEY` al archivo `.env`. El modelo se controla con `GEMINI_MODEL`. Si no existe una clave, el resto del juego continúa funcionando y el panel muestra una indicación clara al intentar generar palabras.

## Seguridad

El servidor incluye validación por rol, consultas parametrizadas, bloqueo transaccional de partidas, limitación de peticiones, Helmet y contraseñas con bcrypt. En producción debes usar HTTPS y secretos propios.
