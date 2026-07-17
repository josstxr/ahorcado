const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// OWASP Top 10 - A07 Identification and Authentication Failures
// Este middleware limita los intentos de autenticación para reducir ataques por fuerza bruta.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos de autenticación. Intenta de nuevo más tarde.' },
});

// OWASP Top 10 - A05 Security Misconfiguration / A04 Insecure Design
// Limita el tráfico general para evitar abuso del API y reducir la superficie de ataque.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// OWASP Top 10 - A09 Security Logging and Monitoring Failures
// Registra eventos de error para poder detectar accesos anómalos o intentos sospechosos.
function securityLogger(req, res, next) {
  res.on('finish', () => {
    const status = res.statusCode;
    if (status >= 400) {
      console.warn(`[SECURITY] ${req.method} ${req.originalUrl} -> ${status} from ${req.ip}`);
    }
  });
  next();
}

// OWASP Top 10 - A05 Security Misconfiguration
// Obliga el uso de HTTPS cuando la app corre en producción o cuando FORCE_HTTPS=true.
function enforceHttps(req, res, next) {
  const shouldForceHttps = process.env.FORCE_HTTPS === 'true' || process.env.NODE_ENV === 'production';
  if (!shouldForceHttps) {
    return next();
  }

  const forwardedProto = req.get('x-forwarded-proto');
  if (forwardedProto && forwardedProto !== 'https') {
    return res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
  }

  next();
}

// OWASP Top 10 - A05 Security Misconfiguration
// Helmet añade headers de seguridad como CSP, X-Frame-Options y otras protecciones HTTP.
function applySecurityHeaders(app) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
}

module.exports = { authLimiter, generalLimiter, securityLogger, enforceHttps, applySecurityHeaders };
