/**
 * ReuLive - Client-Side Database Engine (IndexedDB)
 * Persists full meeting history and transcripts locally for the user,
 * and synchronizes with the server API.
 */

class DBEngine {
  constructor() {
    this.dbName = 'ReuLiveUserDB';
    this.version = 1;
    this.db = null;
    this.isReady = this.init();
  }

  async init() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported, falling back to memory/local');
        resolve(false);
        return;
      }

      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('meetings')) {
          const store = db.createObjectStore('meetings', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(true);
      };

      request.onerror = (event) => {
        console.warn('IndexedDB error:', event.target.error);
        resolve(false);
      };
    });
  }

  /**
   * Save a meeting both locally in IndexedDB and sync to /api/meetings
   */
  async saveMeeting(meeting) {
    await this.isReady;

    const record = {
      id: meeting.id || `meet_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      sessionId: meeting.sessionId || (window.ReuLiveTelemetry ? window.ReuLiveTelemetry.getSessionId() : null),
      timestamp: meeting.timestamp || new Date().toISOString(),
      dateFormatted: meeting.dateFormatted || new Date().toLocaleString(),
      durationSeconds: meeting.durationSeconds || 0,
      durationFormatted: meeting.durationFormatted || '00:00',
      topic: meeting.topic || 'Coordinación General',
      sentiment: meeting.sentiment || 'Neutral',
      intensity: meeting.intensity || 'Media / Productiva',
      tone: meeting.tone || 'Coordinación General',
      interventionsCount: meeting.interventionsCount || (meeting.transcript ? meeting.transcript.length : 0),
      metrics: meeting.metrics || null,
      transcript: meeting.transcript || [],
      agreements: meeting.agreements || [],
      detailedAgreements: meeting.detailedAgreements || [],
      actionItems: meeting.actionItems || [],
      detailedActionItems: meeting.detailedActionItems || [],
      hasVideo: Boolean(meeting.hasVideo)
    };

    // 1. Save locally in IndexedDB
    if (this.db) {
      try {
        const tx = this.db.transaction('meetings', 'readwrite');
        const store = tx.objectStore('meetings');
        store.put(record);
      } catch (err) {
        console.warn('IndexedDB save error:', err);
      }
    } else {
      // Fallback: localStorage (keep up to 20 recent meetings)
      try {
        const list = JSON.parse(localStorage.getItem('reulive_local_meetings') || '[]');
        list.unshift(record);
        localStorage.setItem('reulive_local_meetings', JSON.stringify(list.slice(0, 20)));
      } catch (e) {}
    }

    // 2. Synchronize to Backend Server (/api/meetings)
    try {
      fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      }).catch(() => {});
    } catch (err) {
      // Offline fallback
    }

    return record;
  }

  /**
   * Retrieve all saved meetings for the current user
   */
  async getMeetings() {
    await this.isReady;

    if (!this.db) {
      try {
        return JSON.parse(localStorage.getItem('reulive_local_meetings') || '[]');
      } catch (e) {
        return [];
      }
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction('meetings', 'readonly');
        const store = tx.objectStore('meetings');
        const request = store.getAll();

        request.onsuccess = () => {
          const results = request.result || [];
          // Sort newest first
          results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          resolve(results);
        };

        request.onerror = () => {
          resolve([]);
        };
      } catch (err) {
        console.warn('Error reading from IndexedDB:', err);
        resolve([]);
      }
    });
  }

  /**
   * Delete a meeting by ID
   */
  async deleteMeeting(id) {
    await this.isReady;
    if (this.db) {
      try {
        const tx = this.db.transaction('meetings', 'readwrite');
        tx.objectStore('meetings').delete(id);
      } catch (e) {}
    }
  }
}

window.DBEngine = DBEngine;
