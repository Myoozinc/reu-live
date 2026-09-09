/**
 * ReuLive - Admin Dashboard & Authentication API
 * Protected with username: admin.one / password: Rona12345
 * Provides metrics, telemetry, full meeting transcripts, and database backups.
 */

const db = require('./lib/db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const action = req.query.action || (req.body && req.body.action);

    // ==========================================
    // 1. LOGIN (Public endpoint with credentials)
    // ==========================================
    if (action === 'login') {
      const { username, password } = req.body || {};

      if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
      }

      const isValid = db.validateAdminCredentials(username.trim(), password);
      if (!isValid) {
        return res.status(401).json({ error: 'Credenciales de administrador incorrectas' });
      }

      const { token, expiresAt } = db.createAdminToken();
      return res.status(200).json({
        success: true,
        message: 'Bienvenido, Administrador',
        token,
        expiresAt
      });
    }

    // ==========================================
    // 2. TOKEN AUTHENTICATION FOR ALL OTHER ACTIONS
    // ==========================================
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim() || req.query.token;

    const isTokenValid = db.verifyAdminToken(token);
    if (!isTokenValid) {
      return res.status(401).json({
        error: 'Sesión expirada o no autorizada. Por favor, ingresa de nuevo.'
      });
    }

    // Token check endpoint
    if (action === 'verify_token') {
      return res.status(200).json({ success: true, valid: true });
    }

    // ==========================================
    // 3. ADMIN DATA ACTIONS
    // ==========================================
    if (action === 'get_dashboard') {
      const stats = await db.getDashboardStats();
      const sessions = await db.getSessions(100);
      const meetings = await db.getMeetings(50);

      return res.status(200).json({
        success: true,
        stats,
        telemetry: sessions,
        meetings
      });
    }

    if (action === 'get_telemetry') {
      const limit = Number(req.query.limit) || 100;
      const sessions = await db.getSessions(limit);
      return res.status(200).json({
        success: true,
        count: sessions.length,
        telemetry: sessions
      });
    }

    if (action === 'get_meetings') {
      const limit = Number(req.query.limit) || 100;
      const meetings = await db.getMeetings(limit);
      return res.status(200).json({
        success: true,
        count: meetings.length,
        meetings
      });
    }

    if (action === 'get_meeting_detail') {
      const id = req.query.id;
      if (!id) {
        return res.status(400).json({ error: 'ID de reunión requerido' });
      }
      const meeting = await db.getMeetingById(id);
      if (!meeting) {
        return res.status(404).json({ error: 'Reunión no encontrada' });
      }
      return res.status(200).json({
        success: true,
        meeting
      });
    }

    if (action === 'export_backup') {
      const fullData = await db.exportFullDatabase();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=reulive_backup_${Date.now()}.json`);
      return res.status(200).json(fullData);
    }

    return res.status(400).json({ error: `Acción '${action}' no reconocida` });
  } catch (err) {
    console.error('Admin API Error:', err);
    return res.status(500).json({ error: 'Error en el servidor de administración' });
  }
};
