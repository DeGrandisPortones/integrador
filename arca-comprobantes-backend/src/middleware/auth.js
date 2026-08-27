// Basic Auth simple para proteger las rutas de comprobantes ARCA — esto escribe
// asientos contables reales en Odoo, así que no queda abierto sin login. Usuario y
// contraseña salen de variables de entorno (ARCA_AUTH_USER / ARCA_AUTH_PASSWORD) para
// poder cambiarlos sin tocar código.
function requireAuth(req, res, next) {
  const usuario = process.env.ARCA_AUTH_USER || 'admin';
  const password = process.env.ARCA_AUTH_PASSWORD || '1234';

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');

  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
    if (user === usuario && pass === password) return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="ARCA Comprobantes"');
  res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
}

module.exports = { requireAuth };
