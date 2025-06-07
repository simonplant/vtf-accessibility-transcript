// VTF Audio Extension - Service Worker\n// Handles audio buffering, transcription, and message coordination\n

import { CircuitBreaker } from './modules/circuit-breaker.js';

class VTFTranscriptionService {
  constructor() {
    
    // Speaker-aware buffers (matches working prototype)
    this.speakerBuffers = new Map(); // streamId -> { buffer, lastActivityTime, pendingTranscripts }
    this.userBuffers = new Map();          
    this.activeTranscriptions = new Map(); 
    this.transcriptionQueue = new Map();
    
    // Activity tracking for adaptive buffering
    this.activityLevel = 'idle';
    this.lastActivityCheck = Date.now();
    this.recentActivities = [];
    
    
    this.retryCount = new Map();           
    this.lastError = new Map();            
    
    
    this.config = {
      bufferDuration: 1.5,               
      maxBufferDuration: 30,             
      silenceTimeout: 2000,              
      maxRetries: 5,
      initialBackoff: 1000,
      maxBackoff: 30000,
      maxTranscriptionHistory: 1000,    
      keepAliveInterval: 20000,
      // Adaptive chunk durations (matches working prototype)
      CHUNK_DURATION_ACTIVE: 1.5,
      CHUNK_DURATION_IDLE: 5.0
    };
    
    
    this.apiKey = null;
    this.whisperEndpoint = 'https://api.openai.com/v1/audio/transcriptions';
    
    
    this.speakerMap = new Map([
      ['XRcupJu26dK_sazaAAPK', 'DP'],
      ['Ixslfo7890K_bazaAAPK', 'Rickman'],
      ['O3e0pz1234K_cazaAAPK', 'Kira']
    ]);
    
    
    this.stats = {
      serviceStartTime: Date.now(),
      captureStartTime: null,
      chunksReceived: 0,
      transcriptionsSent: 0,
      errors: 0,
      totalDuration: 0,
      bytesProcessed: 0
    };
    
    
    this.keepAliveTimer = null;
    
    // Rate limiting
    this.apiCallTimes = [];
    this.maxCallsPerMinute = 50; // Whisper API limit
    this.minTimeBetweenCalls = 1200; // 1.2 seconds minimum between calls
    this.lastApiCallTime = 0;
    
    // Initialize circuit breaker for API calls
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 30000, // 30 seconds
      failureRateThreshold: 0.5
    });
    
    this.setupCircuitBreaker();
    
    // Start activity monitoring
    this.startActivityMonitoring();
  }
  
  setupCircuitBreaker() {
    this.circuitBreaker.onStateChange = (state, info) => {
      console.log(`[Service Worker] Circuit breaker state changed to ${state}`, info);
      
      // Notify popup about circuit state
      this.broadcastCircuitState(state, info);
    };
    
    this.circuitBreaker.onFailure = (error, failureCount) => {
      console.error(`[Service Worker] API failure #${failureCount}:`, error);
      
      // Store error for debugging
      this.stats.lastApiError = {
        message: error.message,
        timestamp: Date.now(),
        failureCount
      };
    };
  }
  
  // Activity monitoring for adaptive buffering (matches working prototype)
  startActivityMonitoring() {
    setInterval(() => {
      this.updateActivityLevel();
    }, 1000);
  }
  
  updateActivityLevel() {
    const now = Date.now();
    // Remove activities older than 10 seconds
    this.recentActivities = this.recentActivities.filter(t => now - t < 10000);
    
    const activityCount = this.recentActivities.length;
    if (activityCount > 20) {
      this.activityLevel = 'high';
    } else if (activityCount > 5) {
      this.activityLevel = 'medium';
    } else {
      this.activityLevel = 'low';
    }
  }
  
  getActivityLevel() {
    return this.activityLevel;
  }
  
  // Adaptive chunk duration based on activity level (matches working prototype)
  getAdaptiveChunkDuration() {
    const activityLevel = this.getActivityLevel();
    switch (activityLevel) {
      case 'high':
        return 1.5; // Active conversation
      case 'medium':
        return 3.0; // Moderate activity
      case 'low':
      default:
        return 5.0; // Idle/quiet
    }
  }
  
  broadcastCircuitState(state, info) {
    chrome.tabs.query({ url: '<all_urls>' }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { 
          type: 'circuitBreakerState',
          state,
          info
        });
      }
    });
  }
  
  async init() {
    
    try {
      
      const storage = await chrome.storage.local.get([
        'openaiApiKey',
        'speakerMappings',
        'settings',
        'transcriptions'
      ]);
      
      
      this.apiKey = storage.openaiApiKey || null;
      if (this.apiKey) {
        
      } else {
        
      }
      
      
      if (storage.speakerMappings) {
        Object.entries(storage.speakerMappings).forEach(([userId, name]) => {
          this.speakerMap.set(userId, name);
        });
        
      }
      
      
      if (storage.settings) {
        Object.assign(this.config, storage.settings);
        
      }
      
      
      this.startKeepAlive();
      
      
    } catch (error) {
      console.error('[Service Worker] Initialization error:', error);
    }
  }
  
  
  async handleMessage(request, sender) {
    
    try {
      switch (request.type) {
        case 'audioChunk':
          return await this.handleAudioChunk(request);
          
        case 'startCapture':
          return await this.handleStartCapture();
          
        case 'stopCapture':
          return await this.handleStopCapture();
          
        case 'getStatus':
          return this.getStatus();
          
        case 'setApiKey':
          return await this.setApiKey(request.apiKey);
          
        case 'captureStarted':
          this.stats.captureStartTime = Date.now();
          return { acknowledged: true };
          
        case 'captureStopped':
          await this.flushAllBuffers();
          return { acknowledged: true };
          
        case 'userJoined':
          
          return { acknowledged: true };
          
        case 'userLeft':
          
          await this.handleUserLeft(request.userId);
          return { acknowledged: true };
          
        case 'reconnectAudio':
          
          await this.handleReconnect();
          return { acknowledged: true };
          
        case 'getTranscriptions':
          return await this.getTranscriptionHistory();
          
        case 'clearTranscriptions':
          await chrome.storage.local.remove('transcriptions');
          return { cleared: true };
          
        case 'updateSpeakerMapping':
          await this.updateSpeakerMapping(request.userId, request.speakerName);
          return { updated: true };
          
        case 'debug':
          return { userBuffers: Array.from(this.userBuffers.keys()), stats: { ...this.stats } };
          
        case 'updateSettings':
          if (request.settings) {
            Object.assign(this.config, request.settings.config || request.settings);
            if (request.settings.apiEndpoint) {
              this.whisperEndpoint = request.settings.apiEndpoint;
            }
            await chrome.storage.local.set({ settings: this.config });
            return { updated: true };
          }
          return { updated: false, error: 'No settings provided' };
          
        case 'forceTranscribe':
          if (request.userId) {
            await this.transcribeUserBuffer(request.userId);
          }
          return { status: 'transcribed' };
          
        default:
          throw new Error(`Unknown message type: ${request.type}`);
      }
    } catch (error) {
      console.error('[Service Worker] Error handling message:', error);
      throw error;
    }
  }
  
  
  async handleAudioChunk(request) {
    const { userId, chunk, timestamp, sampleRate, streamId, maxSample, volume } = request;
    const id = streamId || userId; // Support both formats
    
    if (!id || !chunk || !Array.isArray(chunk)) {
      console.error('[Service Worker] Invalid audioChunk payload', request);
      this.stats.errors++;
      return { error: 'Invalid payload' };
    }
    
    this.stats.chunksReceived++;
    
    // Track activity for adaptive buffering
    this.recentActivities.push(Date.now());
    
    // Speaker-aware buffering (matches working prototype)
    if (!this.speakerBuffers.has(id)) {
      this.speakerBuffers.set(id, {
        buffer: [],
        lastActivityTime: Date.now(),
        pendingTranscripts: [],
        totalSamples: 0,
        startTime: Date.now()
      });
    }
    
    const speakerBuffer = this.speakerBuffers.get(id);
    speakerBuffer.lastActivityTime = Date.now();
    
    // Legacy support for UserBufferManager
    if (!this.userBuffers.has(id)) {
      this.userBuffers.set(id, new UserBufferManager(id, this.config));
    }
    
    const buffer = this.userBuffers.get(id);
    
    // Convert Int16 back to Float32
    const float32Data = this.int16ToFloat32(chunk);
    
    // Add to both buffers
    buffer.addChunk(float32Data, timestamp);
    speakerBuffer.buffer.push({
      samples: float32Data,
      timestamp: timestamp || Date.now(),
      maxSample: maxSample,
      volume: volume
    });
    speakerBuffer.totalSamples += float32Data.length;
    
    // Use adaptive duration for checking if ready
    const adaptiveDuration = this.getAdaptiveChunkDuration();
    const duration = speakerBuffer.totalSamples / 16000;
    
    if (duration >= adaptiveDuration) {
      this.transcribeUserBuffer(id);
    }
    
    console.log(`[Service Worker] Chunk for ${id}: ${chunk.length} samples, duration: ${duration.toFixed(2)}s, activity: ${this.activityLevel}`);
    
    // Periodically broadcast buffer status
    if (this.stats.chunksReceived % 10 === 0) {
      this.broadcastBufferStatus();
    }
    
    return { received: true, bufferSize: buffer.getTotalSamples() };
  }
  
  
  async transcribeUserBuffer(userId) {
    // Check if already queued or processing
    if (this.activeTranscriptions.has(userId) || this.transcriptionQueue.has(userId)) {
      console.log(`[Service Worker] Already processing/queued for ${userId}`);
      return;
    }
    
    // Check speaker buffer first (working prototype approach)
    const speakerBuffer = this.speakerBuffers.get(userId);
    if (speakerBuffer && speakerBuffer.totalSamples > 0) {
      // Extract from speaker buffer
      const allSamples = [];
      const startTime = speakerBuffer.startTime;
      
      speakerBuffer.buffer.forEach(chunk => {
        allSamples.push(...chunk.samples);
      });
      
      // Clear speaker buffer
      speakerBuffer.buffer = [];
      speakerBuffer.totalSamples = 0;
      speakerBuffer.startTime = Date.now();
      
      const audioData = {
        samples: allSamples,
        startTime,
        duration: allSamples.length / 16000
      };
      
      this.transcriptionQueue.set(userId, audioData);
    } else {
      // Fallback to legacy buffer
      const buffer = this.userBuffers.get(userId);
      if (!buffer || !buffer.hasData()) {
        return;
      }
      
      const audioData = buffer.extractForTranscription();
      if (!audioData || audioData.samples.length === 0) return;
      
      this.transcriptionQueue.set(userId, audioData);
    }
    
    // Process queue
    await this.processTranscriptionQueue();
  }
  
  async processTranscriptionQueue() {
    // Process one user at a time from the queue
    for (const [userId, audioData] of this.transcriptionQueue) {
      if (this.activeTranscriptions.has(userId)) continue;
      
      this.transcriptionQueue.delete(userId);
      
      try {
        const transcriptionPromise = this.performTranscription(userId, audioData);
        this.activeTranscriptions.set(userId, transcriptionPromise);
        
        await transcriptionPromise;
        
        this.retryCount.delete(userId);
        this.lastError.delete(userId);
        
      } catch (error) {
        console.error(`[Service Worker] Transcription error for ${userId}:`, error);
        this.handleTranscriptionError(userId, error);
        
      } finally {
        this.activeTranscriptions.delete(userId);
        this.broadcastBufferStatus();
      }
    }
  }
  
  
  async performTranscription(userId, audioData) {
    if (!this.apiKey) {
      throw new Error('No API key configured');
    }
    
    // Rate limiting check
    await this.enforceRateLimit();
    
    // Create WAV blob
    const wavBlob = this.createWAV(audioData.samples, 16000);
    
    // Prepare form data
    const formData = new FormData();
    formData.append('file', wavBlob, 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');
    formData.append('response_format', 'json');
    
    // Add speaker context
    const speaker = this.getSpeakerName(userId);
    formData.append('prompt', `Speaker: ${speaker}. Virtual Trading Floor audio.`);
    
    // Execute API call with circuit breaker protection
    try {
      const result = await this.circuitBreaker.execute(async () => {
        const response = await fetch(this.whisperEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: formData
        });
        
        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Whisper API error: ${response.status} - ${error}`);
        }
        
        return await response.json();
      });
      
      // Process successful result
      if (result && result.text && result.text.trim()) {
        const transcription = {
          userId,
          text: result.text.trim(),
          speaker: speaker,
          timestamp: audioData.startTime,
          duration: audioData.duration
        };
        
        this.stats.transcriptionsSent++;
        this.stats.totalDuration += transcription.duration;
        
        await this.storeTranscription(transcription);
        this.broadcastTranscription(transcription);
      }
    } catch (error) {
      // Check if circuit breaker is open
      if (this.circuitBreaker.state === 'OPEN') {
        console.warn(`[Service Worker] Circuit breaker OPEN for ${userId}, skipping transcription`);
        // Store audio for later retry
        this.storeFailedAudio(userId, audioData);
      } else {
        // Re-throw for normal error handling
        throw error;
      }
    }
  }
  
  /**
   * Store failed audio for later retry
   * @param {string} userId - User ID
   * @param {Object} audioData - Audio data that failed to transcribe
   */
  storeFailedAudio(userId, audioData) {
    // Store in IndexedDB or chrome.storage for persistence
    const failedItem = {
      userId,
      audioData,
      timestamp: Date.now(),
      retryCount: 0
    };
    
    // For now, just log it
    console.log(`[Service Worker] Storing failed audio for ${userId}, duration: ${audioData.duration}s`);
    
    // TODO: Implement persistent storage for retry
  }
  
  async enforceRateLimit() {
    const now = Date.now();
    
    // Minimum time between calls
    const timeSinceLastCall = now - this.lastApiCallTime;
    if (timeSinceLastCall < this.minTimeBetweenCalls) {
      const waitTime = this.minTimeBetweenCalls - timeSinceLastCall;
      console.log(`[Service Worker] Rate limiting: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Calls per minute limit
    this.apiCallTimes = this.apiCallTimes.filter(t => now - t < 60000);
    if (this.apiCallTimes.length >= this.maxCallsPerMinute) {
      const oldestCall = this.apiCallTimes[0];
      const waitTime = 60000 - (now - oldestCall) + 100; // +100ms buffer
      console.log(`[Service Worker] Rate limit reached, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastApiCallTime = Date.now();
    this.apiCallTimes.push(this.lastApiCallTime);
  }
  
  
  createWAV(float32Array, sampleRate) {
    const length = float32Array.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);
    
    
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); 
    view.setUint16(20, 1, true); 
    view.setUint16(22, 1, true); 
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); 
    view.setUint16(32, 2, true); 
    view.setUint16(34, 16, true); 
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);
    
    
    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }
  
  
  int16ToFloat32(int16Array) {
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }
    return float32Array;
  }
  
  
  getSpeakerName(userId) {
    
    if (this.speakerMap.has(userId)) {
      return this.speakerMap.get(userId);
    }
    
    
    const shortId = userId.substring(0, 6).toUpperCase();
    return `Speaker-${shortId}`;
  }
  
  
  async updateSpeakerMapping(userId, speakerName) {
    this.speakerMap.set(userId, speakerName);
    
    
    const mappings = Object.fromEntries(this.speakerMap);
    await chrome.storage.local.set({ speakerMappings: mappings });
    
    
  }
  
  
  async storeTranscription(transcription) {
    try {
      
      const { transcriptions = [] } = await chrome.storage.local.get('transcriptions');
      
      
      transcriptions.push({
        ...transcription,
        id: `${transcription.timestamp}-${transcription.userId}`,
        storedAt: Date.now()
      });
      
      
      if (transcriptions.length > this.config.maxTranscriptionHistory) {
        transcriptions.splice(0, transcriptions.length - this.config.maxTranscriptionHistory);
      }
      
      
      await chrome.storage.local.set({ transcriptions });
      
    } catch (error) {
      console.error('[Service Worker] Error storing transcription:', error);
    }
  }
  
  
  async getTranscriptionHistory() {
    const { transcriptions = [] } = await chrome.storage.local.get('transcriptions');
    return { transcriptions };
  }
  
  
  broadcastTranscription(transcription) {
    chrome.tabs.query({ url: '<all_urls>' }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: 'transcription', data: transcription });
      }
    });
  }
  
  
  broadcastBufferStatus() {
    const status = {
      type: 'bufferStatus',
      data: {
        bufferSeconds: this.getTotalBufferSeconds(),
        isProcessing: this.activeTranscriptions.size > 0,
        activeUsers: this.userBuffers.size,
        speakerBuffers: this.getBufferDetails(),
        stats: this.stats
      }
    };
    chrome.tabs.query({ url: '<all_urls>' }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, status);
      }
    });
  }
  
  
  getTotalBufferSeconds() {
    let total = 0;
    this.userBuffers.forEach(buffer => {
      total += buffer.totalSamples / 16000;
    });
    return total;
  }
  
  
  getBufferDetails() {
    const details = {};
    
    // Include speaker buffers (primary)
    this.speakerBuffers.forEach((buffer, streamId) => {
      const duration = buffer.totalSamples / 16000;
      if (duration > 0) {
        details[streamId] = {
          duration,
          lastActivity: Date.now() - buffer.lastActivityTime,
          speaker: this.getSpeakerName(streamId)
        };
      }
    });
    
    // Include legacy buffers
    this.userBuffers.forEach((buffer, userId) => {
      if (!details[userId]) {
        const duration = buffer.totalSamples / 16000;
        if (duration > 0) {
          details[userId] = {
            duration,
            lastActivity: Date.now() - buffer.lastActivity,
            speaker: this.getSpeakerName(userId)
          };
        }
      }
    });
    
    return details;
  }
  
  
  handleTranscriptionError(userId, error) {
    this.stats.errors++;
    this.lastError.set(userId, error);
    
    const retries = this.retryCount.get(userId) || 0;
    
    
    if (retries >= this.config.maxRetries) {
      console.error(`[Service Worker] Max retries reached for ${userId}, clearing buffer`);
      this.userBuffers.get(userId)?.clear();
      this.retryCount.delete(userId);
      return;
    }
    
    
    if (error.message.includes('API key')) {
      console.error('[Service Worker] API key error, not retrying');
      return;
    }
    
    
    const backoff = Math.min(
      this.config.initialBackoff * Math.pow(2, retries),
      this.config.maxBackoff
    );
    
    
    this.retryCount.set(userId, retries + 1);
    
    setTimeout(() => {
      this.transcribeUserBuffer(userId);
    }, backoff);
  }
  
  
  async handleUserLeft(userId) {
    
    const buffer = this.userBuffers.get(userId);
    if (buffer && buffer.hasData()) {
      
      await this.transcribeUserBuffer(userId);
    }
    
    
    this.userBuffers.delete(userId);
    this.activeTranscriptions.delete(userId);
    this.retryCount.delete(userId);
    this.lastError.delete(userId);
  }
  
  
  async handleReconnect() {
    
    
    await this.flushAllBuffers();
    
    
    this.userBuffers.clear();
    this.activeTranscriptions.clear();
    this.retryCount.clear();
    this.lastError.clear();
    
    
  }
  
  
  async flushAllBuffers() {
    
    const promises = [];
    
    this.userBuffers.forEach((buffer, userId) => {
      if (buffer.hasData()) {
        promises.push(this.transcribeUserBuffer(userId));
      }
    });
    
    if (promises.length > 0) {
      
      await Promise.allSettled(promises);
    }
  }
  
  
  async handleStartCapture() {
    
    this.stats.captureStartTime = Date.now();
    
    
    this.speakerBuffers.clear();
    this.userBuffers.clear();
    this.activeTranscriptions.clear();
    this.retryCount.clear();
    this.lastError.clear();
    
    // Reset activity tracking
    this.recentActivities = [];
    this.activityLevel = 'idle';
    
    return { status: 'started' };
  }
  
  
  async handleStopCapture() {
    
    
    await this.flushAllBuffers();
    
    this.stats.captureStartTime = null;
    
    return { status: 'stopped' };
  }
  
  
  async setApiKey(apiKey) {
    if (!apiKey) {
      throw new Error('API key is required');
    }
    
    // Validate API key format (OpenAI keys start with 'sk-')
    if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
      throw new Error('Invalid API key format. OpenAI API keys should start with "sk-"');
    }
    
    // Test the API key with a minimal request
    try {
      const testResponse = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (!testResponse.ok) {
        if (testResponse.status === 401) {
          throw new Error('Invalid API key - authentication failed');
        }
        throw new Error(`API key validation failed: ${testResponse.status}`);
      }
    } catch (error) {
      if (error.message.includes('API key')) {
        throw error;
      }
      // Network errors are okay - we'll handle them during actual use
      console.warn('[Service Worker] Could not validate API key (network issue):', error);
    }
    
    this.apiKey = apiKey;
    await chrome.storage.local.set({ openaiApiKey: apiKey });
    
    console.log('[Service Worker] API key saved and validated');
    return { status: 'saved' };
  }
  
  
  getStatus() {
    const bufferStats = Array.from(this.userBuffers.entries()).map(([userId, buffer]) => ({
      userId,
      speaker: this.getSpeakerName(userId),
      samples: buffer.totalSamples,
      duration: buffer.totalSamples / 16000,
      lastActivity: Date.now() - buffer.lastActivity,
      isActive: this.activeTranscriptions.has(userId)
    }));
    
    // Get circuit breaker state
    const circuitBreakerState = this.circuitBreaker.getState();
    
    return {
      hasApiKey: !!this.apiKey,
      isCapturing: !!this.stats.captureStartTime,
      uptime: Date.now() - this.stats.serviceStartTime,
      stats: {
        ...this.stats,
        successRate: this.stats.chunksReceived > 0 
          ? ((this.stats.transcriptionsSent / this.stats.chunksReceived) * 100).toFixed(1) + '%'
          : '0%'
      },
      activeUsers: this.userBuffers.size,
      activeTranscriptions: this.activeTranscriptions.size,
      buffers: bufferStats,
      errors: Array.from(this.lastError.entries()).map(([userId, error]) => ({
        userId,
        speaker: this.getSpeakerName(userId),
        error: error.message,
        retries: this.retryCount.get(userId) || 0
      })),
      circuitBreaker: {
        state: circuitBreakerState.state,
        isHealthy: circuitBreakerState.state === 'CLOSED',
        failureRate: (circuitBreakerState.failureRate * 100).toFixed(1) + '%',
        failures: circuitBreakerState.failures,
        timeUntilReset: circuitBreakerState.timeUntilReset
      }
    };
  }
  
  
  startKeepAlive() {
    
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }
    
    
    this.keepAliveTimer = setInterval(() => {
      if (this.stats.captureStartTime) {
        
        
        chrome.storage.local.get(null, () => {});
      }
    }, this.config.keepAliveInterval);
  }
  
  
  destroy() {
    
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }
    
    this.userBuffers.clear();
    this.activeTranscriptions.clear();
    this.retryCount.clear();
    this.lastError.clear();
  }
}

class UserBufferManager {
  constructor(userId, config) {
    this.userId = userId;
    this.config = config;
    this.chunks = [];
    this.totalSamples = 0;
    this.lastActivity = Date.now();
    this.silenceTimer = null;
    this.startTime = Date.now();
  }
  
  
  addChunk(samples, timestamp) {
    this.chunks.push({
      samples,
      timestamp: timestamp || Date.now(),
      addedAt: Date.now()
    });
    
    this.totalSamples += samples.length;
    this.lastActivity = Date.now();
    
    
    this.resetSilenceTimer();
    
    
    this.trimBuffer();
  }
  
  
  isReadyToTranscribe(adaptiveDuration = null) {
    const duration = this.totalSamples / 16000;
    const targetDuration = adaptiveDuration || this.config.bufferDuration;
    return duration >= targetDuration;
  }
  
  
  hasData() {
    return this.totalSamples > 0;
  }
  
  
  extractForTranscription() {
    if (this.chunks.length === 0) return null;
    
    
    const allSamples = [];
    const startTime = this.chunks[0].timestamp;
    
    this.chunks.forEach(chunk => {
      allSamples.push(...chunk.samples);
    });
    
    
    this.chunks = [];
    this.totalSamples = 0;
    
    return {
      samples: allSamples,
      startTime,
      duration: allSamples.length / 16000
    };
  }
  
  
  resetSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }
    
    
    this.silenceTimer = setTimeout(() => {
      if (this.hasData()) {
        
        
        chrome.runtime.sendMessage({
          type: 'forceTranscribe',
          userId: this.userId
        }).catch(() => {});
      }
    }, this.config.silenceTimeout);
  }
  
  
  trimBuffer() {
    const maxSamples = this.config.maxBufferDuration * 16000;
    
    while (this.totalSamples > maxSamples && this.chunks.length > 1) {
      const removed = this.chunks.shift();
      this.totalSamples -= removed.samples.length;
      
    }
  }
  
  
  clear() {
    this.chunks = [];
    this.totalSamples = 0;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
  
  
  getTotalSamples() {
    return this.totalSamples;
  }
}

let vtfService = null;

self.addEventListener('activate', event => {
  
  event.waitUntil(clients.claim());
});

self.addEventListener('install', event => {
  
  self.skipWaiting();
});

// CRITICAL: Always send response to prevent "message channel closed" error
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[VTF Background] Received message:', request.type);
  
  // Initialize service if needed
  if (!vtfService) {
    vtfService = new VTFTranscriptionService();
    vtfService.init();
  }
  
  // Handle message types
  switch (request.type) {
    case 'audioData':
      // Handle audio data from content script (matches working prototype)
      vtfService.handleAudioChunk({
        userId: request.userId || request.streamId,
        chunk: request.audioData,
        timestamp: request.timestamp,
        sampleRate: 16000,
        streamId: request.streamId,
        maxSample: request.maxSample,
        volume: request.volume
      }).then(response => {
        sendResponse({ received: true, status: 'success', ...response });
      }).catch(error => {
        console.error('[VTF Background] Audio chunk error:', error);
        sendResponse({ received: true, status: 'error', error: error.message });
      });
      break;
      
    case 'audioChunk':
      // Legacy format support
      vtfService.handleAudioChunk({
        userId: request.userId,
        chunk: request.chunk,
        timestamp: request.timestamp,
        sampleRate: request.sampleRate || 16000
      }).then(response => {
        sendResponse({ received: true, status: 'success', ...response });
      }).catch(error => {
        sendResponse({ received: true, status: 'error', error: error.message });
      });
      break;
      
    case 'userJoined':
    case 'userLeft':
    case 'captureStarted':
    case 'captureStopped':
      // Handle state changes
      vtfService.handleMessage(request, sender).then(response => {
        sendResponse({ received: true, ...response });
      }).catch(error => {
        sendResponse({ received: true, error: error.message });
      });
      break;
      
    case 'startCapture':
    case 'stopCapture':
    case 'getStatus':
    case 'setApiKey':
    case 'getTranscriptions':
    case 'updateSettings':
      // Handle control messages
      vtfService.handleMessage(request, sender).then(response => {
        sendResponse({ received: true, ...response });
      }).catch(error => {
        sendResponse({ received: true, error: error.message });
      });
      break;
      
    default:
      // Default response for unknown message types
      console.warn('[VTF Background] Unknown message type:', request.type);
      sendResponse({ received: true, error: 'Unknown message type' });
      break;
  }
  
  // CRITICAL: Return true to indicate async response
  return true;
});

self.addEventListener('message', event => {
  if (event.data.type === 'forceTranscribe' && vtfService) {
    const { userId } = event.data;
    
    vtfService.transcribeUserBuffer(userId);
  }
});


