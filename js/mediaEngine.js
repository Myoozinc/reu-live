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
    this.isMicMuted = false;
    this.isVideoMuted = false;
    this.micGainNode = null;
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
   * Desktop: screen share (Zoom window) + system audio + mic
   * Mobile: camera + mic (screen share not supported on mobile browsers)
   */
  async startUnifiedCapture() {
    const mobile = this.isMobile();
    let hasVideo = false;
    let sourceLabel = '';

    if (!mobile) {
      // DESKTOP: Try screen/window capture with system audio
      try {
        this.displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'window', cursor: 'always' },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        hasVideo = this.displayStream.getVideoTracks().length > 0;
        sourceLabel = 'Pantalla/Zoom + Audio Sistema';
      } catch (err) {
        console.warn('Screen share denied or unavailable:', err);
        this.displayStream = null;
      }

      // Also capture mic separately on desktop
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
      } catch (err) {
        console.warn('Mic not available:', err);
      }

      // If screen share failed, try camera as fallback
      if (!this.displayStream) {
        try {
          this.cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: { echoCancellation: true, noiseSuppression: true }
          });
          hasVideo = true;
          this.micStream = this.cameraStream; // audio is included
          sourceLabel = 'Cámara + Micrófono';
        } catch (err) {
          console.warn('Camera fallback failed:', err);
        }
      }
    } else {
      // MOBILE: Camera + Mic (getDisplayMedia not supported on mobile)
      try {
        this.cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        hasVideo = true;
        this.micStream = this.cameraStream;
        sourceLabel = 'Cámara + Micrófono';
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

      const barWidth = (width / bufferLength) * 2;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height * 0.9;
        const gradient = this.canvasCtx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, 'rgba(0, 240, 255, 0.15)');
        gradient.addColorStop(0.5, 'rgba(112, 0, 255, 0.7)');
        gradient.addColorStop(1, '#ff007a');
        this.canvasCtx.fillStyle = gradient;
        this.canvasCtx.fillRect(x, height - barHeight, barWidth - 2, barHeight);
        x += barWidth;
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
    return true;
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

  stopAll() {
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
