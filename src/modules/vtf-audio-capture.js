/**
 * VTFAudioCapture - Main audio capture interface for VTF elements
 * 
 * This module manages audio capture from VTF elements using Web Audio API.
 * It supports both AudioWorklet (preferred) and ScriptProcessor (fallback)
 * for maximum compatibility. All captures share a single AudioContext for
 * efficiency.
 * 
 * @module vtf-audio-capture
 */

// Intentional exception: Direct import of VTFAudioWorkletNode is required for worklet instantiation and is documented as an exception to strict decoupling.
import { VTFAudioWorkletNode } from './vtf-audio-worklet-node.js';

// Temporary stub for AudioDataTransfer (will be implemented later)
class AudioDataTransfer {
  sendAudioData(userId, samples) {
    console.log(`[Audio Transfer] Would send ${samples.length} samples for ${userId}`);
    // Will be implemented in next module
  }
}

export class VTFAudioCapture {
  constructor(options = {}) {
    // Configuration
    this.config = {
      sampleRate: 16000,           // Optimal for Whisper
      bufferSize: 4096,            // Samples per chunk
      silenceThreshold: 0.001,     // Minimum amplitude to process
      latencyHint: 'interactive',  // Balance latency vs power
      maxCaptures: 50,             // Prevent memory issues
      workletPath: 'audio-worklet.js',
      ...options
    };
    
    // Core components
    this.audioContext = null;
    this.workletReady = false;
    this.captures = new Map();
    this.dataTransfer = null;
    this.globalsFinder = null;
    
    // Statistics
    this.stats = {
      capturesStarted: 0,
      capturesStopped: 0,
      workletUsed: 0,
      fallbackUsed: 0,
      errors: 0
    };
    
    // State
    this.isInitialized = false;
    this.volumeSyncInterval = null;
  }
  
  /**
   * Initialize audio context and capabilities
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      console.warn('[Audio Capture] Already initialized');
      return;
    }
    
    console.log('[Audio Capture] Initializing...');
    
    try {
      // Create audio context with optimal settings
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.config.sampleRate,
        latencyHint: this.config.latencyHint
      });
      
      console.log(`[Audio Capture] Created AudioContext: ${this.audioContext.state}, ${this.audioContext.sampleRate}Hz`);
      
      // Resume if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        console.log('[Audio Capture] AudioContext resumed');
      }
      
      // Initialize data transfer
      this.dataTransfer = new AudioDataTransfer();
      
      // Try to load AudioWorklet
      await this.loadAudioWorklet();
      
      // Start volume sync
      this.startVolumeSync();
      
      this.isInitialized = true;
      console.log('[Audio Capture] Initialization complete');
      
    } catch (error) {
      console.error('[Audio Capture] Initialization failed:', error);
      this.stats.errors++;
      throw error;
    }
  }
  
  /**
   * Attempt to load AudioWorklet module
   * @private
   */
  async loadAudioWorklet() {
    try {
      // Check if AudioWorklet is supported
      if (!this.audioContext.audioWorklet) {
        console.warn('[Audio Capture] AudioWorklet not supported');
        this.workletReady = false;
        return;
      }
      
      // Construct worklet URL
      let workletUrl = this.config.workletPath;
      
      // If in Chrome extension context, use chrome.runtime.getURL
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        workletUrl = chrome.runtime.getURL(`workers/${this.config.workletPath}`);
      }
      
      console.log('[Audio Capture] Loading AudioWorklet from:', workletUrl);
      
      // Load the module
      await this.audioContext.audioWorklet.addModule(workletUrl);
      
      this.workletReady = true;
      console.log('[Audio Capture] AudioWorklet loaded successfully');
      
    } catch (error) {
      console.warn('[Audio Capture] AudioWorklet failed, will use ScriptProcessor fallback:', error);
      this.workletReady = false;
    }
  }
  
  /**
   * Start capturing audio from a VTF element
   * @param {HTMLAudioElement} element - The audio element
   * @param {MediaStream} stream - The MediaStream to capture
   * @param {string} userId - Unique identifier for this capture
   * @returns {Promise<void>}
   */
  async captureElement(element, stream, userId) {
    // Validate inputs
    if (!element || !(element instanceof HTMLAudioElement)) {
      throw new Error('[Audio Capture] Invalid audio element');
    }
    
    if (!stream || !(stream instanceof MediaStream)) {
      throw new Error('[Audio Capture] Invalid MediaStream');
    }
    
    if (!userId || typeof userId !== 'string') {
      throw new Error('[Audio Capture] Invalid userId');
    }
    
    console.log(`[Audio Capture] Starting capture for ${userId}`);
    
    // Check if already capturing
    if (this.captures.has(userId)) {
      console.warn(`[Audio Capture] Already capturing ${userId}`);
      return;
    }
    
    // Check capture limit
    if (this.captures.size >= this.config.maxCaptures) {
      throw new Error(`[Audio Capture] Maximum captures (${this.config.maxCaptures}) reached`);
    }
    
    // Ensure initialized
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      // Get audio tracks
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks in stream');
      }
      
      const track = audioTracks[0];
      console.log(`[Audio Capture] Using track: ${track.label}, state: ${track.readyState}`);
      
      // Create source from stream
      const source = this.audioContext.createMediaStreamSource(stream);
      
      // Create gain node for volume control
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = this.getVTFVolume();
      
      // Create processor (worklet or script)
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
      
      // Connect audio graph: source -> gain -> processor -> destination
      source.connect(gainNode);
      gainNode.connect(processor);
      processor.connect(this.audioContext.destination);
      
      // Store capture info
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
      
      // Monitor track state
      this.setupTrackMonitoring(track, userId);
      
      console.log(`[Audio Capture] Capture started for ${userId} using ${processorType}`);
      
    } catch (error) {
      console.error(`[Audio Capture] Failed to capture ${userId}:`, error);
      this.stats.errors++;
      throw error;
    }
  }
  
  /**
   * Create AudioWorklet processor
   * @private
   */
  async createWorkletProcessor(userId) {
    const workletNode = new VTFAudioWorkletNode(this.audioContext, userId, {
      bufferSize: this.config.bufferSize,
      silenceThreshold: this.config.silenceThreshold
    });
    
    await workletNode.initialize();
    
    // Set up audio data handler
    workletNode.onAudioData((data) => {
      this.handleAudioData(userId, data);
    });
    
    return workletNode.node;
  }
  
  /**
   * Create ScriptProcessor fallback
   * @private
   */
  createScriptProcessor(userId) {
    console.log(`[Audio Capture] Creating ScriptProcessor for ${userId}`);
    
    const processor = this.audioContext.createScriptProcessor(
      this.config.bufferSize,
      1,  // Input channels
      1   // Output channels
    );
    
    processor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      
      // Calculate max sample for silence detection
      let maxSample = 0;
      for (let i = 0; i < inputData.length; i++) {
        const absSample = Math.abs(inputData[i]);
        if (absSample > maxSample) {
          maxSample = absSample;
        }
      }
      
      // Skip silence
      if (maxSample < this.config.silenceThreshold) {
        return;
      }
      
      // Handle audio data
      this.handleAudioData(userId, {
        samples: Array.from(inputData),
        timestamp: event.playbackTime || this.audioContext.currentTime,
        maxSample: maxSample
      });
    };
    
    return processor;
  }
  
  /**
   * Handle incoming audio data
   * @private
   */
  handleAudioData(userId, data) {
    const capture = this.captures.get(userId);
    if (!capture) {
      console.warn(`[Audio Capture] No capture found for ${userId}`);
      return;
    }
    
    // Update statistics
    capture.sampleCount += data.samples.length;
    capture.chunkCount++;
    
    // Send via data transfer
    if (this.dataTransfer) {
      this.dataTransfer.sendAudioData(userId, data.samples);
    }
    
    // Log periodically
    if (capture.chunkCount % 10 === 0) {
      const duration = (Date.now() - capture.startTime) / 1000;
      const avgChunkRate = capture.chunkCount / duration;
      console.log(`[Audio Capture] ${userId}: ${capture.chunkCount} chunks, ${avgChunkRate.toFixed(1)} chunks/sec`);
    }
  }
  
  /**
   * Set up track state monitoring
   * @private
   */
  setupTrackMonitoring(track, userId) {
    track.onended = () => {
      console.log(`[Audio Capture] Track ended for ${userId}`);
      this.stopCapture(userId);
    };
    
    track.onmute = () => {
      console.log(`[Audio Capture] Track muted for ${userId}`);
      const capture = this.captures.get(userId);
      if (capture) {
        capture.muted = true;
      }
    };
    
    track.onunmute = () => {
      console.log(`[Audio Capture] Track unmuted for ${userId}`);
      const capture = this.captures.get(userId);
      if (capture) {
        capture.muted = false;
      }
    };
  }
  
  /**
   * Stop capturing for a specific user
   * @param {string} userId - The user to stop capturing
   * @returns {boolean} - True if capture was active and stopped
   */
  async stopCapture(userId) {
    const capture = this.captures.get(userId);
    if (!capture) {
      return false;
    }
    
    console.log(`[Audio Capture] Stopping capture for ${userId}`);
    
    try {
      // Disconnect audio nodes
      capture.source.disconnect();
      capture.gainNode.disconnect();
      
      if (capture.processorType === 'worklet') {
        // Find and destroy worklet node
        const workletNodes = Array.from(this.captures.values())
          .filter(c => c.processorType === 'worklet' && c.processor === capture.processor);
        
        if (workletNodes.length === 1) {
          // This is the only capture using this worklet
          capture.processor.port.postMessage({ command: 'stop' });
        }
      }
      
      capture.processor.disconnect();
      
      // Log final statistics
      const duration = (Date.now() - capture.startTime) / 1000;
      console.log(`[Audio Capture] Stopped ${userId}: ${capture.chunkCount} chunks over ${duration.toFixed(1)}s`);
      
      // Stop all tracks in the MediaStream
      if (capture.stream && typeof capture.stream.getTracks === 'function') {
        for (const track of capture.stream.getTracks()) {
          track.stop();
        }
      }
      
    } catch (error) {
      console.error(`[Audio Capture] Error stopping ${userId}:`, error);
    }
    
    // Remove from captures map
    this.captures.delete(userId);
    this.stats.capturesStopped++;
    
    return true;
  }
  
  /**
   * Stop all active captures
   * @returns {number} - Number of captures stopped
   */
  async stopAll() {
    console.log('[Audio Capture] Stopping all captures');
    
    const userIds = Array.from(this.captures.keys());
    let stopped = 0;
    
    for (const userId of userIds) {
      if (await this.stopCapture(userId)) {
        stopped++;
      }
    }
    
    console.log(`[Audio Capture] Stopped ${stopped} captures`);
    return stopped;
  }
  
  /**
   * Get current VTF volume from globals
   * @returns {number} - Volume between 0.0 and 1.0
   */
  getVTFVolume() {
    // Since we can't access globalsFinder here, we need to check if it was passed during init
    if (this.globalsFinder?.globals?.audioVolume !== undefined) {
      return Math.max(0, Math.min(1, this.globalsFinder.globals.audioVolume));
    }
    
    // Fallback - try to find it ourselves (not ideal but works)
    try {
      const webcam = document.getElementById('webcam');
      if (webcam?.__ngContext__?.[8]?.appService?.globals?.audioVolume !== undefined) {
        return Math.max(0, Math.min(1, webcam.__ngContext__[8].appService.globals.audioVolume));
      }
    } catch (e) {
      // Ignore errors
    }
    
    return 1.0; // Default to full volume
  }
  
  /**
   * Update volume for all active captures
   * @param {number} volume - New volume (0.0 to 1.0)
   */
  updateVolume(volume) {
    const normalizedVolume = Math.max(0, Math.min(1, volume));
    console.log(`[Audio Capture] Updating volume to ${normalizedVolume}`);
    
    // Update all gain nodes
    for (const [userId, capture] of this.captures) {
      if (capture.gainNode) {
        capture.gainNode.gain.value = normalizedVolume;
      }
    }
  }
  
  /**
   * Start periodic volume synchronization
   * @private
   */
  startVolumeSync() {
    // Sync volume every second
    this.volumeSyncInterval = setInterval(() => {
      const currentVolume = this.getVTFVolume();
      
      // Update all captures if volume changed
      for (const capture of this.captures.values()) {
        if (capture.gainNode && Math.abs(capture.gainNode.gain.value - currentVolume) > 0.01) {
          capture.gainNode.gain.value = currentVolume;
        }
      }
    }, 1000);
  }
  
  /**
   * Get number of active captures
   * @returns {number}
   */
  getCaptureCount() {
    return this.captures.size;
  }
  
  /**
   * Get statistics for a specific capture
   * @param {string} userId - The user to get stats for
   * @returns {Object|null} - Capture statistics or null
   */
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
  
  /**
   * Get statistics for all captures
   * @returns {Object} - Overall statistics
   */
  getAllStats() {
    const captureStats = Array.from(this.captures.keys()).map(userId => 
      this.getCaptureStats(userId)
    );
    
    return {
      ...this.stats,
      contextState: this.audioContext?.state || 'not-created',
      sampleRate: this.audioContext?.sampleRate || 0,
      workletReady: this.workletReady,
      activeCaptures: this.captures.size,
      captures: captureStats,
      currentVolume: this.getVTFVolume()
    };
  }
  
  /**
   * Get debug information
   * @returns {Object} - Debug state
   */
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
   * Clean up and destroy the capture system
   */
  destroy() {
    console.log('[Audio Capture] Destroying capture system');
    
    // Stop all captures
    this.stopAll();
    
    // Clear volume sync
    if (this.volumeSyncInterval) {
      clearInterval(this.volumeSyncInterval);
      this.volumeSyncInterval = null;
    }
    
    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      console.log('[Audio Capture] Audio context closed');
    }
    
    // Clear references
    this.audioContext = null;
    this.dataTransfer = null;
    this.isInitialized = false;
    
    console.log('[Audio Capture] Destroyed successfully');
  }
}

// Export as default as well
export default VTFAudioCapture;