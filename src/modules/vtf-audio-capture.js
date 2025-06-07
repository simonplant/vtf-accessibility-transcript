/**
 * VTF Audio Capture Module
 * 
 * @property {VTFGlobalsFinder} globalsFinder - Must be set externally after construction
 *                                              to access VTF global state (volume, etc)
 */
import { VTFAudioWorkletNode } from './vtf-audio-worklet-node.js';
import { AudioDataTransfer } from './audio-data-transfer.js';
import { AudioQualityMonitor } from './audio-quality-monitor.js';

export class VTFAudioCapture {
  constructor(options = {}) {
    this.config = {
      sampleRate: 16000,
      bufferSize: 4096,
      silenceThreshold: 0.001,
      latencyHint: 'interactive',
      maxCaptures: 50,
      workletPath: 'audio-worklet.js',
      enableQualityMonitoring: true,
      ...options
    };
    this.audioContext = null;
    this.workletReady = false;
    this.captures = new Map();
    if (typeof AudioDataTransfer === 'function') {
      this.dataTransfer = new AudioDataTransfer();
    } else {
      this.dataTransfer = null;
      console.warn('[Audio Capture] AudioDataTransfer is not available or stubbed. Audio transfer will be disabled.');
    }
    
    // Initialize audio quality monitor
    this.qualityMonitor = this.config.enableQualityMonitoring 
      ? new AudioQualityMonitor({
          silenceThreshold: this.config.silenceThreshold
        })
      : null;
    
    this.globalsFinder = null;
    this.stats = {
      capturesStarted: 0,
      capturesStopped: 0,
      workletUsed: 0,
      fallbackUsed: 0,
      errors: 0,
      audioQualityIssues: 0
    };
    this.isInitialized = false;
    this.volumeSyncInterval = null;
    this.eventCallbacks = {
      captureStarted: [],
      captureStopped: [],
      captureError: []
    };
  }

  /**
   * Register an event callback
   * @param {string} event
   * @param {Function} callback
   */
  on(event, callback) {
    if (this.eventCallbacks[event]) {
      this.eventCallbacks[event].push(callback);
    }
  }

  /**
   * Remove an event callback
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    if (this.eventCallbacks[event]) {
      const index = this.eventCallbacks[event].indexOf(callback);
      if (index > -1) {
        this.eventCallbacks[event].splice(index, 1);
      }
    }
  }

  /**
   * Emit an event
   * @param {string} event
   * @param  {...any} args
   */
  emit(event, ...args) {
    if (this.eventCallbacks[event]) {
      this.eventCallbacks[event].forEach(callback => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`[Audio Capture] Error in ${event} callback:`, error);
        }
      });
    }
  }

  /**
   * Initialize the audio capture system
   * @async
   * @throws {Error} If audio context creation fails
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.config.sampleRate,
        latencyHint: this.config.latencyHint
      });
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      await this.loadAudioWorklet();
      this.startVolumeSync();
      this.isInitialized = true;
    } catch (error) {
      console.error('[Audio Capture] Initialization failed:', error);
      this.stats.errors++;
      throw error;
    }
  }

  async loadAudioWorklet() {
    try {
      if (!this.audioContext.audioWorklet) {
        console.warn('[Audio Capture] AudioWorklet not supported');
        this.workletReady = false;
        return;
      }
      
      let workletUrl = this.config.workletPath;
      
      // Proper Chrome extension URL handling
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        // Fix: Use correct path without 'workers/' prefix since it's already in web_accessible_resources
        workletUrl = chrome.runtime.getURL('workers/audio-worklet.js');
        console.log('[Audio Capture] Loading AudioWorklet from:', workletUrl);
      }
      
      await this.audioContext.audioWorklet.addModule(workletUrl);
      this.workletReady = true;
      console.log('[Audio Capture] AudioWorklet loaded successfully');
      
    } catch (error) {
      console.warn('[Audio Capture] AudioWorklet failed, will use ScriptProcessor fallback:', error);
      console.warn('[Audio Capture] Attempted URL:', workletUrl);
      this.workletReady = false;
    }
  }

  /**
   * Capture audio from a VTF audio element
   * @async
   * @param {HTMLAudioElement} element - The audio element to capture
   * @param {MediaStream} stream - The media stream to capture
   * @param {string} userId - Unique identifier for the user
   * @throws {Error} If capture setup fails
   */
  async captureElement(element, stream, userId) {
    if (!element || !(element instanceof HTMLAudioElement)) {
      throw new Error('[Audio Capture] Invalid audio element');
    }
    if (!stream || !(stream instanceof MediaStream)) {
      throw new Error('[Audio Capture] Invalid MediaStream');
    }
    if (!userId || typeof userId !== 'string') {
      throw new Error('[Audio Capture] Invalid userId');
    }
    if (this.captures.has(userId)) {
      return;
    }
    if (this.captures.size >= this.config.maxCaptures) {
      throw new Error(`[Audio Capture] Maximum captures (${this.config.maxCaptures}) reached`);
    }
    if (!this.isInitialized) {
      await this.initialize();
    }
    try {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks in stream');
      }
      const track = audioTracks[0];
      const source = this.audioContext.createMediaStreamSource(stream);
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = this.getVTFVolume();
      let processor;
      let processorType;
      if (this.workletReady) {
        processor = await this.createWorkletProcessor(userId);
        processorType = 'worklet';
        this.stats.workletUsed++;
      } else {
        processor = this.createScriptProcessor(userId);
        processorType = 'script';
        this.stats.fallbackUsed++;
      }
      source.connect(gainNode);
      gainNode.connect(processor);
      processor.connect(this.audioContext.destination);
      const capture = {
        element,
        stream,
        track,
        source,
        gainNode,
        processor,
        processorType,
        startTime: Date.now(),
        sampleCount: 0,
        chunkCount: 0
      };
      this.captures.set(userId, capture);
      this.stats.capturesStarted++;
      this.setupTrackMonitoring(track, userId);
      this.emit('captureStarted', userId);
    } catch (error) {
      console.error(`[Audio Capture] Failed to capture ${userId}:`, error);
      this.stats.errors++;
      this.emit('captureError', userId, error);
      throw error;
    }
  }

  async createWorkletProcessor(userId) {
    const workletNode = new VTFAudioWorkletNode(this.audioContext, userId, {
      bufferSize: this.config.bufferSize,
      silenceThreshold: this.config.silenceThreshold
    });
    await workletNode.initialize();
    workletNode.onAudioData((data) => {
      this.handleAudioData(userId, data);
    });
    return workletNode.node;
  }

  createScriptProcessor(userId) {
    console.warn('[Audio Capture] Using deprecated ScriptProcessorNode as fallback. AudioWorklet is recommended.');
    const processor = this.audioContext.createScriptProcessor(
      this.config.bufferSize,
      1,
      1
    );
    processor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      let maxSample = 0;
      for (let i = 0; i < inputData.length; i++) {
        const absSample = Math.abs(inputData[i]);
        if (absSample > maxSample) {
          maxSample = absSample;
        }
      }
      if (maxSample < this.config.silenceThreshold) {
        return;
      }
      this.handleAudioData(userId, {
        samples: Array.from(inputData),
        timestamp: event.playbackTime || this.audioContext.currentTime,
        maxSample: maxSample
      });
    };
    return processor;
  }

  handleAudioData(userId, data) {
    const capture = this.captures.get(userId);
    if (!capture) {
      return;
    }
    
    capture.sampleCount += data.samples.length;
    capture.chunkCount++;
    
    // Audio quality monitoring
    if (this.qualityMonitor && data.samples) {
      const quality = this.qualityMonitor.analyze(new Float32Array(data.samples));
      
      // Log quality issues
      if (quality.quality !== 'good') {
        this.stats.audioQualityIssues++;
        console.warn(`[Audio Capture] Quality issue for ${userId}:`, quality.issues);
        
        // Emit quality warning event
        this.emit('audioQualityWarning', {
          userId,
          quality: quality.quality,
          issues: quality.issues,
          metrics: {
            snr: quality.snr,
            clipping: quality.clipping.ratio,
            silence: quality.silence.ratio
          }
        });
      }
      
      // Skip sending if audio is completely silent
      if (quality.quality === 'silent') {
        return;
      }
    }
    
    if (this.dataTransfer) {
      this.dataTransfer.sendAudioData(userId, data.samples);
    }
    
    if (capture.chunkCount % 10 === 0) {
      const duration = (Date.now() - capture.startTime) / 1000;
      const avgChunkRate = capture.chunkCount / duration;
    }
  }

  setupTrackMonitoring(track, userId) {
    track.onended = () => {
      this.stopCapture(userId);
    };
    track.onmute = () => {
      const capture = this.captures.get(userId);
      if (capture) {
        capture.muted = true;
      }
    };
    track.onunmute = () => {
      const capture = this.captures.get(userId);
      if (capture) {
        capture.muted = false;
      }
    };
  }

  /**
   * Stop capturing audio for a specific user
   * @async
   * @param {string} userId - The user to stop capturing
   * @returns {boolean} True if capture was stopped, false if not found
   */
  async stopCapture(userId) {
    const capture = this.captures.get(userId);
    if (!capture) {
      return false;
    }
    try {
      capture.source.disconnect();
      capture.gainNode.disconnect();
      if (capture.processorType === 'worklet') {
        const workletNodes = Array.from(this.captures.values())
          .filter(c => c.processorType === 'worklet' && c.processor === capture.processor);
        if (workletNodes.length === 1) {
          capture.processor.port.postMessage({ command: 'stop' });
        }
      }
      capture.processor.disconnect();
      const duration = (Date.now() - capture.startTime) / 1000;
      if (capture.stream && typeof capture.stream.getTracks === 'function') {
        for (const track of capture.stream.getTracks()) {
          track.stop();
        }
      }
    } catch (error) {
      console.error(`[Audio Capture] Error stopping ${userId}:`, error);
    }
    this.captures.delete(userId);
    this.stats.capturesStopped++;
    this.emit('captureStopped', userId);
    return true;
  }

  async stopAll() {
    const userIds = Array.from(this.captures.keys());
    let stopped = 0;
    for (const userId of userIds) {
      if (await this.stopCapture(userId)) {
        stopped++;
      }
    }
    return stopped;
  }

  getVTFVolume() {
    // Try globalsFinder first
    if (this.globalsFinder?.globals?.audioVolume !== undefined) {
      return Math.max(0, Math.min(1, this.globalsFinder.globals.audioVolume));
    }
    // Fallback: search through __ngContext__ array
    try {
      const webcam = document.getElementById('webcam');
      if (webcam?.__ngContext__) {
        for (let i = 0; i < webcam.__ngContext__.length; i++) {
          const ctx = webcam.__ngContext__[i];
          if (ctx?.appService?.globals?.audioVolume !== undefined) {
            return Math.max(0, Math.min(1, ctx.appService.globals.audioVolume));
          }
        }
      }
    } catch (e) {}
    return 1.0;
  }

  updateVolume(volume) {
    const normalizedVolume = Math.max(0, Math.min(1, volume));
    for (const [userId, capture] of this.captures) {
      if (capture.gainNode) {
        capture.gainNode.gain.value = normalizedVolume;
      }
    }
  }

  startVolumeSync() {
    this.volumeSyncInterval = setInterval(() => {
      const currentVolume = this.getVTFVolume();
      for (const capture of this.captures.values()) {
        if (capture.gainNode && Math.abs(capture.gainNode.gain.value - currentVolume) > 0.01) {
          capture.gainNode.gain.value = currentVolume;
        }
      }
    }, 1000);
  }

  getCaptureCount() {
    return this.captures.size;
  }

  getCaptureStats(userId) {
    const capture = this.captures.get(userId);
    if (!capture) {
      return null;
    }
    const duration = (Date.now() - capture.startTime) / 1000;
    return {
      userId,
      processorType: capture.processorType,
      duration: duration,
      sampleCount: capture.sampleCount,
      chunkCount: capture.chunkCount,
      chunksPerSecond: capture.chunkCount / duration,
      trackState: capture.track.readyState,
      muted: capture.track.muted || capture.muted || false
    };
  }

  getAllStats() {
    const captureStats = Array.from(this.captures.keys()).map(userId =>
      this.getCaptureStats(userId)
    );
    
    // Get quality monitor stats if available
    const qualityStats = this.qualityMonitor 
      ? this.qualityMonitor.getStats()
      : null;
    
    return {
      ...this.stats,
      contextState: this.audioContext?.state || 'not-created',
      sampleRate: this.audioContext?.sampleRate || 0,
      workletReady: this.workletReady,
      activeCaptures: this.captures.size,
      captures: captureStats,
      currentVolume: this.getVTFVolume(),
      audioQuality: qualityStats
    };
  }

  debug() {
    const captureDebug = {};
    for (const [userId, capture] of this.captures) {
      captureDebug[userId] = {
        processorType: capture.processorType,
        duration: (Date.now() - capture.startTime) / 1000,
        chunks: capture.chunkCount,
        element: {
          id: capture.element.id,
          paused: capture.element.paused,
          volume: capture.element.volume
        },
        stream: {
          id: capture.stream.id,
          active: capture.stream.active
        },
        track: {
          label: capture.track.label,
          readyState: capture.track.readyState,
          muted: capture.track.muted
        }
      };
    }
    return {
      isInitialized: this.isInitialized,
      config: { ...this.config },
      stats: this.getAllStats(),
      captures: captureDebug,
      audioContext: {
        state: this.audioContext?.state,
        sampleRate: this.audioContext?.sampleRate,
        currentTime: this.audioContext?.currentTime,
        baseLatency: this.audioContext?.baseLatency
      }
    };
  }

  /**
   * Destroy the audio capture system and clean up resources
   * @async
   */
  async destroy() {
    console.log('[Audio Capture] Starting destroy...');
    await this.stopAll();
    if (this.volumeSyncInterval) {
      clearInterval(this.volumeSyncInterval);
      this.volumeSyncInterval = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close();
        console.log('[Audio Capture] Audio context closed');
      } catch (error) {
        console.error('[Audio Capture] Error closing audio context:', error);
      }
    }
    for (const event in this.eventCallbacks) {
      this.eventCallbacks[event] = [];
    }
    this.audioContext = null;
    this.dataTransfer = null;
    this.globalsFinder = null;
    this.isInitialized = false;
    console.log('[Audio Capture] Destroyed');
  }
}

export default VTFAudioCapture;