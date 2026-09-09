/**
 * ReuLive - Unified Media Engine
 * Single capture method that auto-detects device and captures everything.
 * Exports WAV audio + video on stop.
 */
class MediaEngine {
  constructor() {
    this.displayStream = null;
    this.micStream = null;
    this.cameraStream = null;
    this.combinedStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.isCapturing = false;
    
    // For WAV export
    this.audioRecordingDest = null;
    this.audioChunks = [];
    this.audioRecorder = null;
    
    this.canvas = null;
    this.canvasCtx = null;
    this.animFrameId = null;
    this.onVolumeChange = null;
    this.onAudioChunk = null;
    this.chunkTimer = null;
    this.isMicMuted = false;
    this.isVideoMuted = false;
    this.micGainNode = null;
    this.currentFacingMode = 'user';
  }

  initCanvas(canvasElement) {
    if (!canvasElement) return;
    this.canvas = canvasElement;
    this.canvasCtx = canvasElement.getContext('2d');
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    if (!this.canvas) return;
    this.canvas.width = this.canvas.parentElement ? this.canvas.parentElement.clientWidth : 600;
    this.canvas.height = 60;
  }

  /**
   * Detect if running on mobile
   */
  isMobile() {
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
      || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
  }

  /**
   * UNIFIED CAPTURE: One method that captures everything based on device
   * Desktop: screen share (Zoom window) + system audio + mic (or camera fallback)
   * Mobile/Tablet: default to Selfie Camera (user) + mic (with screen share support if available)
   */
  async startUnifiedCapture(preferredSource = 'auto') {
    const mobile = this.isMobile();
    let hasVideo = false;
    let sourceLabel = '';
    const canShareScreen = navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function';

    if (!mobile || (preferredSource === 'screen' && canShareScreen)) {
      // DESKTOP or Screen-capable tablet: Try screen/window capture with system audio
      try {
        this.displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'window', cursor: 'always' },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        hasVideo = this.displayStream.getVideoTracks().length > 0;
        sourceLabel = 'Pantalla + Audio Sistema';
      } catch (err) {
        console.warn('Screen share denied or unavailable:', err);
        this.displayStream = null;
      }

      // Also capture mic separately
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
      } catch (err) {
        console.warn('Mic not available:', err);
      }

      // If screen share failed or wasn't chosen, try camera as fallback (selfie front by default)
      if (!this.displayStream) {
        try {
          this.cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: this.currentFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: { echoCancellation: true, noiseSuppression: true }
          });
          hasVideo = true;
          this.micStream = this.cameraStream; // audio is included
          sourceLabel = this.currentFacingMode === 'user' ? 'Cámara Selfie + Micrófono' : 'Cámara Trasera + Micrófono';
        } catch (err) {
          console.warn('Camera fallback failed:', err);
        }
      }
    } else {
      // MOBILE / TABLET: Front Selfie Camera + Mic by default
      try {
        this.cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: this.currentFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        hasVideo = true;
        this.micStream = this.cameraStream;
        sourceLabel = this.currentFacingMode === 'user' ? 'Cámara Selfie + Micrófono' : 'Cámara Trasera + Micrófono';
      } catch (err) {
        // Fallback: mic only
        try {
          this.micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true }
          });
          sourceLabel = 'Solo Micrófono';
        } catch (micErr) {
          throw new Error('No se pudo acceder al micrófono ni a la cámara.');
        }
      }
    }

    // If we have absolutely no audio source, throw
    if (!this.micStream && !this.displayStream) {
      throw new Error('No se detectó ninguna fuente de audio.');
    }

    this.setupAudioMixing();
    this.isCapturing = true;

    return {
      hasVideo,
      sourceLabel,
      videoTrack: this.getVideoTrack()
    };
  }

  getVideoTrack() {
    if (this.displayStream && this.displayStream.getVideoTracks().length > 0) {
      return this.displayStream.getVideoTracks()[0];
    }
    if (this.cameraStream && this.cameraStream.getVideoTracks().length > 0) {
      return this.cameraStream.getVideoTracks()[0];
    }
    return null;
  }

  getVideoStream() {
    if (this.displayStream && this.displayStream.getVideoTracks().length > 0) return this.displayStream;
    if (this.cameraStream && this.cameraStream.getVideoTracks().length > 0) return this.cameraStream;
    return null;
  }

  /**
   * Mix all audio sources via Web Audio API
   */
  setupAudioMixing() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioCtx();
    }

    const destination = this.audioContext.createMediaStreamDestination();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 128;

    const tracks = [];

    // Collect video tracks
    const vt = this.getVideoTrack();
    if (vt) tracks.push(vt);

    // System audio from display stream
    if (this.displayStream && this.displayStream.getAudioTracks().length > 0) {
      const sysSource = this.audioContext.createMediaStreamSource(
        new MediaStream([this.displayStream.getAudioTracks()[0]])
      );
      const gain = this.audioContext.createGain();
      sysSource.connect(gain);
      gain.connect(destination);
      gain.connect(this.analyser);
    }

    // Mic audio
    if (this.micStream && this.micStream.getAudioTracks().length > 0) {
      const micAudioTrack = this.micStream.getAudioTracks()[0];
      // Don't double-connect if mic is same as display audio
      if (!this.displayStream || !this.displayStream.getAudioTracks().includes(micAudioTrack)) {
        const micSource = this.audioContext.createMediaStreamSource(
          new MediaStream([micAudioTrack])
        );
        this.micGainNode = this.audioContext.createGain();
        micSource.connect(this.micGainNode);
        this.micGainNode.connect(destination);
        this.micGainNode.connect(this.analyser);
      }
    }

    // Combined stream = video + mixed audio
    destination.stream.getAudioTracks().forEach(track => tracks.push(track));
    this.combinedStream = new MediaStream(tracks);

    // Also prepare a pure audio stream for WAV export
    this.audioRecordingDest = destination;

    this.startVisualizer();
  }

  startVisualizer() {
    if (!this.analyser || !this.canvasCtx) return;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this.animFrameId = requestAnimationFrame(draw);
      this.analyser.getByteFrequencyData(dataArray);

      const width = this.canvas.width;
      const height = this.canvas.height;
      this.canvasCtx.clearRect(0, 0, width, height);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const avgVolume = Math.round((sum / bufferLength / 255) * 100);
      if (this.onVolumeChange) this.onVolumeChange(avgVolume);

      // Serene Zen Pastel Visualizer
      const barsToDraw = 42;
      const step = Math.floor(bufferLength / barsToDraw) || 1;
      const totalSpacing = 4;
      const barWidth = Math.max(3, (width - (barsToDraw * totalSpacing)) / barsToDraw);

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

      for (let i = 0; i < barsToDraw; i++) {
        const val = dataArray[i * step] || 0;
        const barHeight = Math.max(2, (val / 255) * (height - 8));
        const x = i * (barWidth + totalSpacing) + totalSpacing / 2;
        const y = height - barHeight - 2;

        const gradient = this.canvasCtx.createLinearGradient(0, height, 0, y);
        if (isDark) {
          gradient.addColorStop(0, 'rgba(59, 130, 246, 0.15)'); // Soft royal blue base
          gradient.addColorStop(0.5, 'rgba(56, 189, 248, 0.65)'); // Electric cyan
          gradient.addColorStop(1, 'rgba(147, 197, 253, 0.95)'); // Bright highlight
        } else {
          gradient.addColorStop(0, 'rgba(29, 104, 240, 0.12)');  // Soft royal blue base
          gradient.addColorStop(0.5, 'rgba(37, 99, 235, 0.55)'); // Vibrant royal blue
          gradient.addColorStop(1, 'rgba(96, 165, 250, 0.85)'); // Electric blue
        }

        this.canvasCtx.fillStyle = gradient;

        if (this.canvasCtx.roundRect) {
          this.canvasCtx.beginPath();
          const r = Math.min(barWidth / 2, 4);
          this.canvasCtx.roundRect(x, y, barWidth, barHeight, [r, r, 0, 0]);
          this.canvasCtx.fill();
        } else {
          this.canvasCtx.fillRect(x, y, barWidth, barHeight);
        }
      }
    };
    draw();
  }

  /**
   * Start recording both video+audio and pure audio (for WAV)
   */
  startRecording() {
    const stream = this.combinedStream;
    if (!stream) return false;

    this.recordedChunks = [];
    this.audioChunks = [];

    // Video+Audio recorder
    let options = {};
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
      options = { mimeType: 'video/webm;codecs=vp9,opus' };
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      options = { mimeType: 'video/webm' };
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      options = { mimeType: 'video/mp4' };
    } else if (MediaRecorder.isTypeSupported('audio/webm')) {
      options = { mimeType: 'audio/webm' };
    }

    try {
      this.mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
      this.mediaRecorder = new MediaRecorder(stream);
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.recordedChunks.push(event.data);
    };
    this.mediaRecorder.start(1000);

    // Pure audio recorder for WAV export
    if (this.audioRecordingDest) {
      const audioStream = this.audioRecordingDest.stream;
      try {
        this.audioRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' });
      } catch (e) {
        try {
          this.audioRecorder = new MediaRecorder(audioStream);
        } catch (e2) {
          this.audioRecorder = null;
        }
      }
      if (this.audioRecorder) {
        this.audioRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) this.audioChunks.push(event.data);
        };
        this.audioRecorder.start(1000);
      }
    }

    this.isRecording = true;
    this.startRealtimeChunkRecorder();
    return true;
  }

  /**
   * Periodically emits 8-second audio chunks for real-time Whisper transcription (/api/transcribe).
   * Also separates tracks (Zoom/System audio vs Mic) to assign speaker accurately.
   */
  startRealtimeChunkRecorder() {
    if (this.chunkTimer) clearInterval(this.chunkTimer);

    const emitChunkFromStream = (stream, speakerType) => {
      if (!stream || stream.getAudioTracks().length === 0 || !this.isRecording) return;
      let chunks = [];
      let recorder = null;

      try {
        recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      } catch (e) {
        try { recorder = new MediaRecorder(stream); } catch (e2) { return; }
      }

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        if (chunks.length > 0 && this.onAudioChunk && this.isRecording) {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          if (blob.size > 2500) {
            this.onAudioChunk({ blob, speakerType });
          }
        }
      };

      try {
        recorder.start();
        setTimeout(() => {
          if (recorder && recorder.state === 'recording') {
            try { recorder.stop(); } catch (e) {}
          }
        }, 8000);
      } catch (err) {
        console.warn('Chunk recorder error:', err);
      }
    };

    const recordIntervalSlice = () => {
      if (!this.isRecording) return;

      const hasDisplayAudio = this.displayStream && this.displayStream.getAudioTracks().length > 0;
      const hasMicAudio = this.micStream && this.micStream.getAudioTracks().length > 0 && !this.isMicMuted;

      if (hasDisplayAudio) {
        // System audio (Zoom / Meeting participants) -> 'interlocutor'
        const sysStream = new MediaStream([this.displayStream.getAudioTracks()[0]]);
        emitChunkFromStream(sysStream, 'interlocutor');

        // Local microphone -> 'user' ("Tú")
        if (hasMicAudio) {
          const micTrack = this.micStream.getAudioTracks()[0];
          if (!this.displayStream.getAudioTracks().includes(micTrack)) {
            const micStreamObj = new MediaStream([micTrack]);
            emitChunkFromStream(micStreamObj, 'user');
          }
        }
      } else if (hasMicAudio) {
        // Only microphone is active -> this is the user speaking ('user')
        const micStreamObj = new MediaStream([this.micStream.getAudioTracks()[0]]);
        emitChunkFromStream(micStreamObj, 'user');
      } else if (this.audioRecordingDest) {
        emitChunkFromStream(this.audioRecordingDest.stream, 'user');
      }
    };

    recordIntervalSlice();
    this.chunkTimer = setInterval(recordIntervalSlice, 8500);
  }

  /**
   * Stop recording and auto-download video + WAV files
   */
  async stopAndExport() {
    const dateStr = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const results = { video: null, audio: null };

    // Stop video recorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      const videoPromise = new Promise((resolve) => {
        this.mediaRecorder.onstop = () => {
          const mime = this.mediaRecorder.mimeType || 'video/webm';
          const ext = mime.includes('mp4') ? 'mp4' : 'webm';
          const blob = new Blob(this.recordedChunks, { type: mime });
          results.video = { blob, ext };
          resolve();
        };
        this.mediaRecorder.stop();
      });
      await videoPromise;
    }

    // Stop audio recorder
    if (this.audioRecorder && this.audioRecorder.state !== 'inactive') {
      const audioPromise = new Promise((resolve) => {
        this.audioRecorder.onstop = () => {
          const blob = new Blob(this.audioChunks, { type: this.audioRecorder.mimeType || 'audio/webm' });
          results.audio = blob;
          resolve();
        };
        this.audioRecorder.stop();
      });
      await audioPromise;
    }

    this.isRecording = false;

    // Auto-download video
    if (results.video && results.video.blob.size > 0) {
      this.downloadBlob(results.video.blob, `ReuLive-Video-${dateStr}.${results.video.ext}`);
    }

    // Convert audio to WAV and download
    if (results.audio && results.audio.size > 0) {
      try {
        const wavBlob = await this.convertToWav(results.audio);
        this.downloadBlob(wavBlob, `ReuLive-Audio-${dateStr}.wav`);
      } catch (e) {
        console.warn('WAV conversion failed, downloading as webm:', e);
        this.downloadBlob(results.audio, `ReuLive-Audio-${dateStr}.webm`);
      }
    }

    return results;
  }

  /**
   * Convert audio blob to WAV format using OfflineAudioContext
   */
  async convertToWav(audioBlob) {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const tempCtx = new AudioCtx();
    
    let audioBuffer;
    try {
      audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
      tempCtx.close();
      throw e;
    }
    tempCtx.close();

    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // Create WAV file
    const wavBuffer = new ArrayBuffer(44 + length * numChannels * 2);
    const view = new DataView(wavBuffer);

    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numChannels * 2, true);

    // Interleave channels
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([wavBuffer], { type: 'audio/wav' });
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /**
   * Mute/unmute the user's microphone (for recording and audio mixing)
   * This prevents the user's voice/noise from being captured
   */
  muteMic() {
    if (this.micGainNode) {
      this.micGainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    }
    // Also mute mic tracks directly
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach(track => {
        // Don't mute if it's the same as display audio
        if (!this.displayStream || !this.displayStream.getAudioTracks().includes(track)) {
          track.enabled = false;
        }
      });
    }
    this.isMicMuted = true;
  }

  unmuteMic() {
    if (this.micGainNode) {
      this.micGainNode.gain.setValueAtTime(1, this.audioContext.currentTime);
    }
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach(track => {
        track.enabled = true;
      });
    }
    this.isMicMuted = false;
  }

  /**
   * Mute/unmute the video track (camera)
   */
  muteVideo() {
    const vt = this.getVideoTrack();
    if (vt) vt.enabled = false;
    this.isVideoMuted = true;
  }

  unmuteVideo() {
    const vt = this.getVideoTrack();
    if (vt) vt.enabled = true;
    this.isVideoMuted = false;
  }

  /**
   * Flip between front (selfie) and back camera on mobile/tablet/desktop
   */
  async flipCamera() {
    this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
    if (!this.cameraStream) {
      return { facingMode: this.currentFacingMode, track: null };
    }

    try {
      const oldVideoTrack = this.cameraStream.getVideoTracks()[0];
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: this.currentFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      const newVideoTrack = newStream.getVideoTracks()[0];

      if (newVideoTrack) {
        if (oldVideoTrack) {
          oldVideoTrack.stop();
          this.cameraStream.removeTrack(oldVideoTrack);
        }
        this.cameraStream.addTrack(newVideoTrack);

        if (this.combinedStream) {
          const combinedVt = this.combinedStream.getVideoTracks()[0];
          if (combinedVt) {
            this.combinedStream.removeTrack(combinedVt);
          }
          this.combinedStream.addTrack(newVideoTrack);
        }
        return { facingMode: this.currentFacingMode, track: newVideoTrack, stream: this.cameraStream };
      }
    } catch (err) {
      console.warn('Could not flip camera:', err);
      // Revert state
      this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
    }
    return { facingMode: this.currentFacingMode, track: null };
  }

  stopAll() {
    if (this.chunkTimer) clearInterval(this.chunkTimer);
    this.chunkTimer = null;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    [this.displayStream, this.micStream, this.cameraStream, this.combinedStream].forEach(stream => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    });
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
    this.displayStream = null;
    this.micStream = null;
    this.cameraStream = null;
    this.combinedStream = null;
    this.isCapturing = false;
  }
}

window.MediaEngine = MediaEngine;
