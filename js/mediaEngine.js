/**
 * ReuLive - Media Engine
 * Handles Audio & Video Stream capture (Zoom, Screen, System Audio & User Mic),
 * Web Audio API mixing, MediaRecorder, and WebGL/Canvas visualizer.
 */

class MediaEngine {
  constructor() {
    this.displayStream = null;
    this.micStream = null;
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

    // Callbacks
    this.onVolumeChange = null;
  }

  initCanvas(canvasElement) {
    this.canvas = canvasElement;
    this.canvasCtx = canvasElement.getContext('2d');
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    if (!this.canvas) return;
    this.canvas.width = this.canvas.parentElement.clientWidth || 800;
    this.canvas.height = 100;
  }

  /**
   * Start capturing Display/Zoom Screen with System Audio + Mic Audio
   */
  async startScreenAudioCapture() {
    try {
      // 1. Get Screen / Window / Zoom Display Media with system audio
      this.displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'window',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // 2. Get User Microphone Audio
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        });
      } catch (micErr) {
        console.warn('Microphone permission denied or not found:', micErr);
        this.micStream = null;
      }

      // 3. Mix audio streams via Web Audio API
      this.setupAudioMixing();

      return {
        videoTrack: this.displayStream.getVideoTracks()[0] || null,
        hasSystemAudio: this.displayStream.getAudioTracks().length > 0,
        hasMicAudio: !!this.micStream
      };

    } catch (error) {
      console.error('Error initiating screen/audio capture:', error);
      throw error;
    }
  }

  /**
   * Start Microphone Only capture
   */
  async startMicOnlyCapture() {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      this.displayStream = null;
      this.setupAudioMixing();

      return {
        videoTrack: null,
        hasSystemAudio: false,
        hasMicAudio: true
      };
    } catch (error) {
      console.error('Error initiating mic capture:', error);
      throw error;
    }
  }

  /**
   * Set up Web Audio API nodes to combine mic & system streams into a single audio output & visualizer
   */
  setupAudioMixing() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioCtx();
    const destination = this.audioContext.createMediaStreamDestination();

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 128;

    // Mixed stream container
    const tracks = [];

    // Video track if present
    if (this.displayStream && this.displayStream.getVideoTracks().length > 0) {
      tracks.push(this.displayStream.getVideoTracks()[0]);
    }

    // System Audio node
    if (this.displayStream && this.displayStream.getAudioTracks().length > 0) {
      const sysSource = this.audioContext.createMediaStreamSource(
        new MediaStream([this.displayStream.getAudioTracks()[0]])
      );
      this.systemGainNode = this.audioContext.createGain();
      this.systemGainNode.gain.value = 1.0;
      sysSource.connect(this.systemGainNode);
      this.systemGainNode.connect(destination);
      this.systemGainNode.connect(this.analyser);
    }

    // User Mic Audio node
    if (this.micStream && this.micStream.getAudioTracks().length > 0) {
      const micSource = this.audioContext.createMediaStreamSource(this.micStream);
      this.micGainNode = this.audioContext.createGain();
      this.micGainNode.gain.value = 1.0;
      micSource.connect(this.micGainNode);
      this.micGainNode.connect(destination);
      this.micGainNode.connect(this.analyser);
    }

    // Add mixed audio track to combinedStream
    destination.stream.getAudioTracks().forEach(track => tracks.push(track));
    this.combinedStream = new MediaStream(tracks);

    // Start Audio Frequency Visualizer animation
    this.startVisualizer();
  }

  /**
   * Canvas Spectrum Waveform Visualizer
   */
  startVisualizer() {
    if (!this.analyser || !this.canvasCtx) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this.animFrameId = requestAnimationFrame(draw);
      this.analyser.getByteFrequencyData(dataArray);

      const width = this.canvas.width;
      const height = this.canvas.height;

      this.canvasCtx.clearRect(0, 0, width, height);

      // Compute average volume for meter
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const avgVolume = Math.round((sum / bufferLength / 255) * 100);

      if (this.onVolumeChange) {
        this.onVolumeChange(avgVolume);
      }

      // Draw futuristic cyber wave bars
      const barWidth = (width / bufferLength) * 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height * 0.85;

        // Gradient color based on frequency
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

  /**
   * MediaRecorder: Start recording meeting audio/video
   */
  startRecording() {
    if (!this.combinedStream && !this.displayStream) return;

    const streamToRecord = this.combinedStream || this.displayStream;
    this.recordedChunks = [];

    const options = { mimeType: 'video/webm;codecs=vp9,opus' };
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
  }

  /**
   * MediaRecorder: Stop recording and trigger file download
   */
  stopRecording() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        this.isRecording = false;
        resolve({ blob, url });
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Clean up all media tracks and audio contexts
   */
  stopAll() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);

    if (this.displayStream) {
      this.displayStream.getTracks().forEach(t => t.stop());
      this.displayStream = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    if (this.combinedStream) {
      this.combinedStream.getTracks().forEach(t => t.stop());
      this.combinedStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }
}

window.MediaEngine = MediaEngine;
