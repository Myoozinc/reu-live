/**
 * ReuLive - Meetings & Conversations API
 * Saves full meeting records (transcripts, agreements, duration, topic)
 * and provides history retrieval.
 */

const db = require('./lib/db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      const meetingData = req.body || {};

      // Auto-populate country if not provided
      const countryCode = req.headers['x-vercel-ip-country'] || meetingData.countryCode || 'XX';

      const meeting = await db.saveMeeting({
        ...meetingData,
        countryCode: meetingData.countryCode || countryCode
      });

      return res.status(200).json({
        success: true,
        meeting
      });
    }

    if (req.method === 'GET') {
      const { id, limit } = req.query;

      if (id) {
        const meeting = await db.getMeetingById(id);
        if (!meeting) {
          return res.status(404).json({ error: 'Reunión no encontrada' });
        }
        return res.status(200).json({ success: true, meeting });
      }

      const meetings = await db.getMeetings(Number(limit) || 50);
      return res.status(200).json({
        success: true,
        count: meetings.length,
        meetings
      });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('Meetings API Error:', err);
    return res.status(500).json({ error: 'Error procesando reuniones' });
  }
};
