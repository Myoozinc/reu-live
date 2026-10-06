/**
 * ReuLive - Export Engine
 * Saves the meeting files (video, WAV audio, transcript) together in one folder:
 * - "Guardar en una carpeta": File System Access API (Chrome / Edge desktop).
 * - "Descargar carpeta (.zip)": works in every browser, no external libraries.
 */
class ExportEngine {
  static supportsFolderSave() {
    return typeof window.showDirectoryPicker === 'function' && window.isSecureContext;
  }

  static folderName(date = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `ReuLive ${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}-${p(date.getMinutes())}`;
  }

  static formatSize(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  static download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
  }

  /**
   * Ask the user for a location and write every file into a new sub-folder.
   * Must be called from a click handler (browser requirement).
   */
  static async saveToFolder(folderName, files) {
    const parent = await window.showDirectoryPicker({ id: 'reulive-meetings', mode: 'readwrite', startIn: 'documents' });
    const dir = await parent.getDirectoryHandle(folderName, { create: true });
    for (const f of files) {
      const handle = await dir.getFileHandle(f.name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(f.blob);
      await writable.close();
    }
    return `${parent.name}/${folderName}`;
  }

  // ---------- ZIP (store, sin compresión: video y WAV no se comprimen bien) ----------

  static crcTable() {
    if (ExportEngine._crcTable) return ExportEngine._crcTable;
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    ExportEngine._crcTable = table;
    return table;
  }

  /** CRC32 of a Blob, read in 8 MB slices so long recordings don't exhaust memory. */
  static async crc32(blob) {
    const table = ExportEngine.crcTable();
    let crc = 0xFFFFFFFF;
    const SLICE = 8 * 1024 * 1024;
    for (let offset = 0; offset < blob.size; offset += SLICE) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + SLICE).arrayBuffer());
      for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  static dosDateTime(date) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
  }

  /** Builds a .zip Blob containing `folderName/` with every file inside. */
  static async buildZip(folderName, files) {
    const total = files.reduce((sum, f) => sum + f.blob.size, 0);
    if (total > 0xFFFFFFF0) {
      throw new Error('La grabación supera 4 GB: usa "Guardar en una carpeta" o descarga los archivos uno a uno.');
    }

    const encoder = new TextEncoder();
    const { time, day } = ExportEngine.dosDateTime(new Date());
    const entries = [{ name: `${folderName}/`, blob: new Blob([]), isDir: true }]
      .concat(files.map(f => ({ name: `${folderName}/${f.name}`, blob: f.blob, isDir: false })));

    const parts = [];
    const central = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = encoder.encode(entry.name);
      const crc = entry.isDir ? 0 : await ExportEngine.crc32(entry.blob);
      const size = entry.blob.size;

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);      // nombres en UTF-8
      local.setUint16(8, 0, true);           // store
      local.setUint16(10, time, true);
      local.setUint16(12, day, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, size, true);
      local.setUint32(22, size, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);
      parts.push(local.buffer, nameBytes, entry.blob);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, time, true);
      cd.setUint16(14, day, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, size, true);
      cd.setUint32(24, size, true);
      cd.setUint16(28, nameBytes.length, true);
      cd.setUint16(30, 0, true);
      cd.setUint16(32, 0, true);
      cd.setUint16(34, 0, true);
      cd.setUint16(36, 0, true);
      cd.setUint32(38, entry.isDir ? 0x10 : 0, true);
      cd.setUint32(42, offset, true);
      central.push(cd.buffer, nameBytes);

      offset += 30 + nameBytes.length + size;
    }

    const centralSize = central.reduce((sum, p) => sum + (p.byteLength || 0), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }

  // ---------- Transcripción en texto ----------

  static buildTranscriptText(meeting, report) {
    const lines = [];
    const hr = '='.repeat(60);
    const list = (items) => (items && items.length ? items.map(i => `  • ${i}`).join('\n') : '  (ninguno)');

    lines.push('REU.LIVE — TRANSCRIPCIÓN DE LA REUNIÓN');
    lines.push(hr);
    lines.push(`Fecha:     ${meeting.dateFormatted || new Date().toLocaleString()}`);
    lines.push(`Duración:  ${meeting.durationFormatted || '00:00'}`);
    lines.push(`Tema:      ${(report && report.title) || meeting.topic || '—'}`);
    if (meeting.languages && meeting.languages.length) {
      lines.push(`Idiomas:   ${meeting.languages.join(', ').toUpperCase()}`);
    }
    lines.push('');

    if (report) {
      lines.push(hr, 'RESUMEN (IA)', hr);
      lines.push(report.executive_summary || '', '');
      lines.push('Puntos principales:', list(report.key_points), '');
      lines.push('Decisiones y acuerdos:', list(report.decisions), '');
      const tasks = (report.action_items || []).map(t => {
        const extra = [t.owner, t.due].filter(Boolean).join(' · ');
        return `${t.task}${extra ? ` (${extra})` : ''}`;
      });
      lines.push('Tareas:', list(tasks), '');
      lines.push('Temas abiertos:', list(report.open_questions), '');
      lines.push('Próximos pasos:', list(report.next_steps), '');
    } else if ((meeting.agreements || []).length || (meeting.actionItems || []).length) {
      lines.push(hr, 'ACUERDOS Y TAREAS', hr);
      lines.push('Acuerdos:', list(meeting.agreements), '');
      lines.push('Tareas:', list(meeting.actionItems), '');
    }

    lines.push(hr, 'TRANSCRIPCIÓN COMPLETA', hr);
    (meeting.transcript || []).forEach(t => {
      const lang = t.lang ? ` [${t.lang.toUpperCase()}]` : '';
      lines.push(`[${t.timestamp || ''}] ${t.speaker}${lang}: ${t.text}`);
      if (t.translation) lines.push(`    ↳ (${(t.translationLang || '').toUpperCase()}) ${t.translation}`);
    });
    if (!(meeting.transcript || []).length) lines.push('(Sin intervenciones registradas)');
    lines.push('', 'Generado por Reu.live — Powered by MYOOZlabs');

    // BOM: acentos correctos al abrir el .txt en Windows
    return new Blob(['﻿' + lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
  }
}

window.ExportEngine = ExportEngine;
