/**
 * ReuLive - Media Engine
 * Robust Audio & Video Capture (Screen, Camera, Zoom, Mic)
 * Mixes Audio Context, drives Spectrum Visualizer, and manages MediaRecorder.
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

    this.systemGainNode = null;
    this.micGainNode = null;

    this.canvas = null;
    this.canvasCtx = null;
    this.animFrameId = null;

    this.onVolumeChange = null;
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
    this.canvas.height = 100;
  }

  /**
   * Option 1: Screen / Zoom Window + System Audio + Mic
   */
  async startScreenAudioCapture() {
    try {
      this.displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'window' },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
    } catch (err) {
      console.warn('Screen share display media not available or denied:', err);
      this.displayStream = null;
    }

    // Capture microphone
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
    } catch (err) {
      console.warn('Mic access warning:', err);
      this.micStream = null;
    }

    this.setupAudioMixing();

    return {
      videoTrack: this.displayStream && this.displayStream.getVideoTracks().length > 0 ? this.displayStream.getVideoTracks()[0] : null,
      stream: this.combinedStream
    };
  }

  /**
   * Option 2: Camera Video + Microphone Audio (Smartphone & Desktop)
   */
  async startCameraAudioCapture() {
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      this.micStream = this.cameraStream;
    } catch (err) {
      console.warn('Camera permission fallback to audio only:', err);
      this.cameraStream = null;
      return await this.startMicOnlyCapture();
    }

    this.setupAudioMixing();

    return {
      videoTrack: this.cameraStream ? this.cameraStream.getVideoTracks()[0] : null,
      stream: this.combinedStream
    };
  }

  /**
   * Option 3: Microphone Audio Only
   */
  async startMicOnlyCapture() {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
    } catch (err) {
      console.error('Error in mic capture:', err);
      throw err;
    }

    this.displayStream = null;
    this.cameraStream = null;
    this.setupAudioMixing();

    return {
      videoTrack: null,
      stream: this.combinedStream
    };
  }

  /**
   * Mix audio & video streams via Web Audio API
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

    // Collect Video Tracks (Display Screen or Camera)
    if (this.displayStream && this.displayStream.getVideoTracks().length > 0) {
      tracks.push(this.displayStream.getVideoTracks()[0]);
    } else if (this.cameraStream && this.cameraStream.getVideoTracks().length > 0) {
      tracks.push(this.cameraStream.getVideoTracks()[0]);
    }

    // System Audio node
    if (this.displayStream && this.displayStream.getAudioTracks().length > 0) {
      const sysSource = this.audioContext.createMediaStreamSource(
        new MediaStream([this.displayStream.getAudioTracks()[0]])
      );
      this.systemGainNode = this.audioContext.createGain();
      sysSource.connect(this.systemGainNode);
      this.systemGainNode.connect(destination);
      this.systemGainNode.connect(this.analyser);
    }

    // Mic Audio node
    if (this.micStream && this.micStream.getAudioTracks().length > 0) {
      const micSource = this.audioContext.createMediaStreamSource(
        new MediaStream([this.micStream.getAudioTracks()[0]])
      );
      this.micGainNode = this.audioContext.createGain();
      micSource.connect(this.micGainNode);
      this.micGainNode.connect(destination);
      this.micGainNode.connect(this.analyser);
    }

    destination.stream.getAudioTracks().forEach(track => tracks.push(track));
    this.combinedStream = new MediaStream(tracks);

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
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const avgVolume = Math.round((sum / bufferLength / 255) * 100);

      if (this.onVolumeChange) {
        this.onVolumeChange(avgVolume);
      }

      const barWidth = (width / bufferLength) * 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height * 0.85;

        const gradient = this.canvasCtx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, 'rgba(0, 240, 255, 0.2)');
        gradient.addColorStop(0.5, 'rgba(112, 0, 255, 0.8)');
        gradient.addColorStop(1, '#ff007a');

        this.canvasCtx.fillStyle = gradient;
        this.canvasCtx.fillRect(x, height - barHeight, barWidth - 2, barHeight);

        x += barWidth;
      }
    };

    draw();
  }

  startRecording() {
    const streamToRecord = this.combinedStream || this.cameraStream || this.displayStream || this.micStream;
    if (!streamToRecord) return false;

    this.recordedChunks = [];

    let options = {};
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
      options = { mimeType: 'video/webm;codecs=vp9,opus' };
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      options = { mimeType: 'video/mp4' };
    } else if (MediaRecorder.isTypeSupported('audio/webm')) {
      options = { mimeType: 'audio/webm' };
    }

    try {
      this.mediaRecorder = new MediaRecorder(streamToRecord, options);
    } catch (e) {
      this.mediaRecorder = new MediaRecorder(streamToRecord);
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(1000);
    this.isRecording = true;
    return true;
  }

  stopRecording() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder.mimeType || 'video/webm';
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        this.isRecording = false;
        resolve({ blob, url, extension: mimeType.includes('mp4') ? 'mp4' : 'webm' });
      };

      this.mediaRecorder.stop();
    });
  }

  stopAll() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    [this.displayStream, this.micStream, this.cameraStream, this.combinedStream].forEach(stream => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    });
    this.displayStream = null;
    this.micStream = null;
    this.cameraStream = null;
    this.combinedStream = null;
  }
}

window.MediaEngine = MediaEngine;
