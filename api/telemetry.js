/**
 * ReuLive - Telemetry & Visitor Tracking API
 * Captures user visits, URLs, country/city, device, and active duration.
 */

const db = require('./lib/db');

// Country name mapping for common country codes
const COUNTRY_MAP = {
  US: 'Estados Unidos',
  ES: 'España',
  MX: 'México',
  CO: 'Colombia',
  AR: 'Argentina',
  CL: 'Chile',
  PE: 'Perú',
  EC: 'Ecuador',
  VE: 'Venezuela',
  GT: 'Guatemala',
  BR: 'Brasil',
  CA: 'Canadá',
  GB: 'Reino Unido',
  FR: 'Francia',
  DE: 'Alemania',
  IT: 'Italia',
  UY: 'Uruguay',
  PA: 'Panamá',
  CR: 'Costa Rica',
  DO: 'Rep. Dominicana'
};

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const action = req.query.action || (req.body && req.body.action) || 'visit';

    // Get IP and Geo headers from Vercel
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
                     req.headers['x-real-ip'] ||
                     req.socket.remoteAddress || '127.0.0.1';

    const countryCode = req.headers['x-vercel-ip-country'] || (req.body && req.body.countryCode) || 'XX';
    const city = req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : (req.body && req.body.city) || 'Desconocida';
    const countryName = COUNTRY_MAP[countryCode] || (req.body && req.body.country) || (countryCode !== 'XX' ? countryCode : 'Desconocido');

    if (action === 'visit') {
      const {
        sessionId,
        url,
        referrer,
        device,
        browser,
        language
      } = req.body || {};

      const session = await db.recordVisit({
        sessionId,
        ip: clientIp,
        country: countryName,
        countryCode,
        city,
        url,
        referrer,
        device,
        browser,
        language
      });

      return res.status(200).json({
        success: true,
        session
      });
    }

    if (action === 'heartbeat') {
      const { sessionId, activeSeconds } = req.body || {};
      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }

      const updated = await db.updateHeartbeat(sessionId, Number(activeSeconds) || 0);
      return res.status(200).json({
        success: true,
        session: updated
      });
    }

    if (action === 'leave') {
      const { sessionId } = req.body || {};
      if (sessionId) {
        await db.endSession(sessionId);
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Acción no válida' });
  } catch (err) {
    console.error('Telemetry API Error:', err);
    return res.status(500).json({ error: 'Error procesando telemetría' });
  }
};
