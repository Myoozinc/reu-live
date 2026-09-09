/**
 * ReuLive - Unified Database Engine
 * Supports Upstash Redis / Vercel KV REST API + Persistent JSON file fallback.
 * Manages visitor telemetry, call/meeting transcripts, and admin authentication.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Admin credentials
const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USERNAME || 'admin.one',
  password: process.env.ADMIN_PASSWORD || 'Rona12345'
};

// Secret for signing admin session tokens
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'reulive_zen_admin_secret_key_2026';

// Storage file fallback path
const DATA_FILE = process.env.VERCEL
  ? path.join('/tmp', 'reulive_db.json')
  : path.join(process.cwd(), 'reulive_db.json');

// In-memory runtime cache
let memoryDB = null;

/**
 * Initialize default DB structure
 */
function getInitialData() {
  return {
    telemetry: [], // Array of visitor session objects
    meetings: [],  // Array of recorded call objects
    stats: {
      totalVisits: 0,
      totalMeetings: 0,
      totalMeetingSeconds: 0,
      countries: {}
    }
  };
}

/**
 * Load local database from file or initialize
 */
function loadLocalDB() {
  if (memoryDB) return memoryDB;
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      memoryDB = JSON.parse(raw);
    } else {
      memoryDB = getInitialData();
      saveLocalDB();
    }
  } catch (err) {
    console.warn('Error reading DB file, using in-memory store:', err);
    memoryDB = memoryDB || getInitialData();
  }
  return memoryDB;
}

/**
 * Save database to local file
 */
function saveLocalDB() {
  try {
    if (memoryDB) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(memoryDB, null, 2), 'utf8');
    }
  } catch (err) {
    console.warn('Could not persist DB to disk:', err);
  }
}

/**
 * Helper to get KV configuration regardless of environment prefix (KV, STORAGE, etc.)
 */
function getKVConfig() {
  const urlKey = Object.keys(process.env).find(k => k === 'KV_REST_API_URL' || k === 'UPSTASH_REDIS_REST_URL' || k.endsWith('_REST_API_URL'));
  const tokenKey = Object.keys(process.env).find(k => k === 'KV_REST_API_TOKEN' || k === 'UPSTASH_REDIS_REST_TOKEN' || k.endsWith('_REST_API_TOKEN'));
  const kvUrl = urlKey ? process.env[urlKey] : null;
  const kvToken = tokenKey ? process.env[tokenKey] : null;
  return { kvUrl, kvToken };
}

/**
 * Helper to interact with Upstash Redis / Vercel KV REST API if configured
 */
async function executeKV(command, args = []) {
  const { kvUrl, kvToken } = getKVConfig();

  if (!kvUrl || !kvToken) return null;

  try {
    const endpoint = `${kvUrl.replace(/\/$/, '')}/${command}/${args.map(encodeURIComponent).join('/')}`;
    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${kvToken}`
      }
    });
    if (!res.ok) {
      console.warn(`KV error [${command}]:`, res.statusText);
      return null;
    }
    const data = await res.json();
    return data.result;
  } catch (err) {
    console.warn(`KV fetch failed [${command}]:`, err.message);
    return null;
  }
}

class DatabaseEngine {
  constructor() {
    loadLocalDB();
  }

  /**
   * Check if KV is active
   */
  hasCloudKV() {
    const { kvUrl, kvToken } = getKVConfig();
    return Boolean(kvUrl && kvToken);
  }

  /**
   * Record a new visitor session (Telemetry)
   */
  async recordVisit(session) {
    const db = loadLocalDB();
    const existingIndex = db.telemetry.findIndex(s => s.sessionId === session.sessionId);

    const record = {
      sessionId: session.sessionId || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      ip: session.ip || '127.0.0.1',
      country: session.country || 'Desconocido',
      countryCode: session.countryCode || 'XX',
      city: session.city || 'Desconocida',
      url: session.url || '/',
      referrer: session.referrer || 'Directo',
      device: session.device || 'Desktop',
      browser: session.browser || 'Unknown',
      language: session.language || 'es',
      firstSeen: session.firstSeen || new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      durationSeconds: session.durationSeconds || 0,
      isOnline: true,
      meetingsCount: session.meetingsCount || 0
    };

    if (existingIndex >= 0) {
      // Update existing session
      db.telemetry[existingIndex] = {
        ...db.telemetry[existingIndex],
        lastSeen: record.lastSeen,
        isOnline: true,
        durationSeconds: Math.max(db.telemetry[existingIndex].durationSeconds || 0, record.durationSeconds)
      };
    } else {
      // Add new session (keep up to 500 most recent)
      db.telemetry.unshift(record);
      if (db.telemetry.length > 500) db.telemetry = db.telemetry.slice(0, 500);

      // Update global stats
      db.stats.totalVisits = (db.stats.totalVisits || 0) + 1;
      const cc = record.countryCode || 'XX';
      db.stats.countries[cc] = (db.stats.countries[cc] || 0) + 1;
    }

    saveLocalDB();

    // Async KV push if available
    if (this.hasCloudKV()) {
      executeKV('HSET', ['reulive:telemetry', record.sessionId, JSON.stringify(record)]).catch(() => {});
    }

    return record;
  }

  /**
   * Update visitor active heartbeat (duration tracking)
   */
  async updateHeartbeat(sessionId, activeSeconds) {
    const db = loadLocalDB();
    const session = db.telemetry.find(s => s.sessionId === sessionId);

    if (session) {
      session.durationSeconds = Math.max(session.durationSeconds || 0, activeSeconds);
      session.lastSeen = new Date().toISOString();
      session.isOnline = true;
      saveLocalDB();

      if (this.hasCloudKV()) {
        executeKV('HSET', ['reulive:telemetry', sessionId, JSON.stringify(session)]).catch(() => {});
      }
      return session;
    }
    return null;
  }

  /**
   * Mark session as ended / offline
   */
  async endSession(sessionId) {
    const db = loadLocalDB();
    const session = db.telemetry.find(s => s.sessionId === sessionId);
    if (session) {
      session.isOnline = false;
      session.lastSeen = new Date().toISOString();
      saveLocalDB();
    }
  }

  /**
   * Save a meeting record (full transcript + AI summaries)
   */
  async saveMeeting(meeting) {
    const db = loadLocalDB();

    const record = {
      id: meeting.id || `meet_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      sessionId: meeting.sessionId || null,
      timestamp: meeting.timestamp || new Date().toISOString(),
      dateFormatted: meeting.dateFormatted || new Date().toLocaleString(),
      durationSeconds: meeting.durationSeconds || 0,
      durationFormatted: meeting.durationFormatted || '00:00',
      topic: meeting.topic || 'Coordinación General',
      sentiment: meeting.sentiment || 'Neutral',
      interventionsCount: meeting.interventionsCount || (meeting.transcript ? meeting.transcript.length : 0),
      transcript: meeting.transcript || [],
      agreements: meeting.agreements || [],
      actionItems: meeting.actionItems || [],
      country: meeting.country || 'Desconocido',
      countryCode: meeting.countryCode || 'XX',
      hasVideo: Boolean(meeting.hasVideo)
    };

    // Store in DB (keep last 300 meetings)
    db.meetings.unshift(record);
    if (db.meetings.length > 300) db.meetings = db.meetings.slice(0, 300);

    // Update stats
    db.stats.totalMeetings = (db.stats.totalMeetings || 0) + 1;
    db.stats.totalMeetingSeconds = (db.stats.totalMeetingSeconds || 0) + record.durationSeconds;

    // Increment meetingsCount in session
    if (record.sessionId) {
      const session = db.telemetry.find(s => s.sessionId === record.sessionId);
      if (session) session.meetingsCount = (session.meetingsCount || 0) + 1;
    }

    saveLocalDB();

    if (this.hasCloudKV()) {
      executeKV('HSET', ['reulive:meetings', record.id, JSON.stringify(record)]).catch(() => {});
    }

    return record;
  }

  /**
   * Get all visitor sessions
   */
  async getSessions(limit = 100) {
    const db = loadLocalDB();
    // Mark sessions older than 2 minutes without heartbeat as offline
    const now = Date.now();
    db.telemetry.forEach(s => {
      const last = new Date(s.lastSeen).getTime();
      if (now - last > 120000) {
        s.isOnline = false;
      }
    });

    return db.telemetry.slice(0, limit);
  }

  /**
   * Get all recorded meetings
   */
  async getMeetings(limit = 100) {
    const db = loadLocalDB();
    return db.meetings.slice(0, limit);
  }

  /**
   * Get meeting by ID
   */
  async getMeetingById(id) {
    const db = loadLocalDB();
    return db.meetings.find(m => m.id === id) || null;
  }

  /**
   * Get comprehensive dashboard metrics
   */
  async getDashboardStats() {
    const db = loadLocalDB();
    const sessions = db.telemetry;
    const meetings = db.meetings;

    const totalVisits = sessions.length;
    const activeNow = sessions.filter(s => s.isOnline).length;
    const totalMeetings = meetings.length;

    // Calculate total duration in app
    const totalAppSeconds = sessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
    const avgDurationSeconds = totalVisits > 0 ? Math.round(totalAppSeconds / totalVisits) : 0;

    // Countries breakdown
    const countryCounts = {};
    sessions.forEach(s => {
      const c = s.country || 'Desconocido';
      countryCounts[c] = (countryCounts[c] || 0) + 1;
    });

    // Topics breakdown
    const topicCounts = {};
    meetings.forEach(m => {
      const t = m.topic || 'General';
      topicCounts[t] = (topicCounts[t] || 0) + 1;
    });

    return {
      totalVisits,
      activeNow,
      totalMeetings,
      avgDurationSeconds,
      avgDurationFormatted: this.formatSeconds(avgDurationSeconds),
      countryCounts,
      topicCounts,
      storageType: this.hasCloudKV() ? 'Vercel KV / Upstash (Nube)' : 'Almacenamiento Local Resiliente'
    };
  }

  /**
   * Export complete database for backup
   */
  async exportFullDatabase() {
    const db = loadLocalDB();
    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      storageType: this.hasCloudKV() ? 'KV_Cloud' : 'Local_JSON',
      stats: await this.getDashboardStats(),
      telemetry: db.telemetry,
      meetings: db.meetings
    };
  }

  /**
   * Format seconds to mm:ss or hh:mm:ss
   */
  formatSeconds(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const remM = m % 60;
      return `${h}h ${remM}m ${s}s`;
    }
    return `${m}m ${s}s`;
  }

  /**
   * Validate Admin Login
   */
  validateAdminCredentials(username, password) {
    return username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password;
  }

  /**
   * Create a signed token for admin session
   */
  createAdminToken() {
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    const payload = `${ADMIN_CREDENTIALS.username}:${expiresAt}`;
    const hmac = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');
    const token = Buffer.from(JSON.stringify({ payload, hmac })).toString('base64');
    return { token, expiresAt };
  }

  /**
   * Verify an admin token
   */
  verifyAdminToken(token) {
    if (!token) return false;
    try {
      const raw = Buffer.from(token, 'base64').toString('utf8');
      const { payload, hmac } = JSON.parse(raw);
      const expectedHmac = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');

      if (hmac !== expectedHmac) return false;

      const [username, expiresAtStr] = payload.split(':');
      if (username !== ADMIN_CREDENTIALS.username) return false;

      const expiresAt = parseInt(expiresAtStr, 10);
      if (Date.now() > expiresAt) return false;

      return true;
    } catch (err) {
      return false;
    }
  }
}

module.exports = new DatabaseEngine();
