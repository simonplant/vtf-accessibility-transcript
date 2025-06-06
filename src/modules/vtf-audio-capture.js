import { VTFAudioWorkletNode } from './vtf-audio-worklet-node.js';
import { AudioDataTransfer } from './audio-data-transfer.js';

export class VTFAudioCapture {
  constructor(options = {}) {
    
    this.config = {
      sampleRate: 16000,           
      bufferSize: 4096,            
      silenceThreshold: 0.001,     
      latencyHint: 'interactive',  
      maxCaptures: 50,             
      workletPath: 'audio-worklet.js',
      ...options
    };
    
    
    this.audioContext = null;
    this.workletReady = false;
    this.captures = new Map();
    this.dataTransfer = new AudioDataTransfer();
    this.globalsFinder = null;
    
    
    this.stats = {
      capturesStarted: 0,
      capturesStopped: 0,
      workletUsed: 0,
      fallbackUsed: 0,
      errors: 0
    };
    
    
    this.isInitialized = false;
    this.volumeSyncInterval = null;
  }
  
  
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
        
        this.workletReady = false;
        return;
      }
      
      
      let workletUrl = this.config.workletPath;
      
      
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        workletUrl = chrome.runtime.getURL(`workers/${this.config.workletPath}`);
      }
      
      
      
      await this.audioContext.audioWorklet.addModule(workletUrl);
      
      this.workletReady = true;
      
    } catch (error) {
      console.warn('[Audio Capture] AudioWorklet failed, will use ScriptProcessor fallback:', error);
      this.workletReady = false;
    }
  }
  
  
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
      
      
    } catch (error) {
      console.error(`[Audio Capture] Failed to capture ${userId}:`, error);
      this.stats.errors++;
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
    
    if (this.globalsFinder?.globals?.audioVolume !== undefined) {
      return Math.max(0, Math.min(1, this.globalsFinder.globals.audioVolume));
    }
    
    
    try {
      const webcam = document.getElementById('webcam');
      if (webcam?.__ngContext__?.[8]?.appService?.globals?.audioVolume !== undefined) {
        return Math.max(0, Math.min(1, webcam.__ngContext__[8].appService.globals.audioVolume));
      }
    } catch (e) {
      
    }
    
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
  
  
  destroy() {
    
    
    this.stopAll();
    
    
    if (this.volumeSyncInterval) {
      clearInterval(this.volumeSyncInterval);
      this.volumeSyncInterval = null;
    }
    
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      
    }
    
    
    this.audioContext = null;
    this.dataTransfer = null;
    this.isInitialized = false;
    
    
  }
}

export default VTFAudioCapture;