/**
 * VTF Audio Extension - Service Worker
 * 
 * Handles audio buffering, transcription via Whisper API, and message coordination
 * between content scripts and the extension popup.
 * 
 * @module background
 */

// Initialize service worker
console.log('[Service Worker] VTF Transcription Service Worker starting...');

/**
 * Main transcription service class
 */
class VTFTranscriptionService {
  constructor() {
    // User buffer management
    this.userBuffers = new Map();          // userId -> UserBufferManager
    this.activeTranscriptions = new Map(); // userId -> Promise
    
    // Retry management
    this.retryCount = new Map();           // userId -> count
    this.lastError = new Map();            // userId -> error
    
    // Configuration
    this.config = {
      bufferDuration: 1.5,               // seconds before transcription
      maxBufferDuration: 30,             // maximum buffer size
      silenceTimeout: 2000,              // ms of silence before flush
      maxRetries: 5,
      initialBackoff: 1000,
      maxBackoff: 30000,
      maxTranscriptionHistory: 1000,    // max stored transcriptions
      keepAliveInterval: 20000           // service worker keepalive
    };
    
    // API configuration
    this.apiKey = null;
    this.whisperEndpoint = 'https://api.openai.com/v1/audio/transcriptions';
    
    // Speaker mapping
    this.speakerMap = new Map([
      ['XRcupJu26dK_sazaAAPK', 'DP'],
      ['Ixslfo7890K_bazaAAPK', 'Rickman'],
      ['O3e0pz1234K_cazaAAPK', 'Kira']
    ]);
    
    // Statistics
    this.stats = {
      serviceStartTime: Date.now(),
      captureStartTime: null,
      chunksReceived: 0,
      transcriptionsSent: 0,
      errors: 0,
      totalDuration: 0,
      bytesProcessed: 0
    };
    
    // Legacy message type mapping
    this.legacyMessageMap = {
      'audioData': 'audioChunk',
      'start_capture': 'startCapture',
      'stop_capture': 'stopCapture',
      'getTranscriptions': 'getStatus'
    };
    
    // Keep-alive mechanism
    this.keepAliveTimer = null;
  }
  
  /**
   * Initialize the service
   */
  async init() {
    console.log('[Service Worker] Initializing VTF Transcription Service...');
    
    try {
      // Load stored data
      const storage = await chrome.storage.local.get([
        'openaiApiKey',
        'speakerMappings',
        'settings',
        'transcriptions'
      ]);
      
      // Set API key
      this.apiKey = storage.openaiApiKey || null;
      if (this.apiKey) {
        console.log('[Service Worker] API key loaded from storage');
      } else {
        console.warn('[Service Worker] No API key found in storage');
      }
      
      // Load custom speaker mappings
      if (storage.speakerMappings) {
        Object.entries(storage.speakerMappings).forEach(([userId, name]) => {
          this.speakerMap.set(userId, name);
        });
        console.log('[Service Worker] Loaded custom speaker mappings:', this.speakerMap.size);
      }
      
      // Load settings
      if (storage.settings) {
        Object.assign(this.config, storage.settings);
        console.log('[Service Worker] Loaded custom settings');
      }
      
      // Start keep-alive mechanism
      this.startKeepAlive();
      
      console.log('[Service Worker] VTF Transcription Service initialized successfully');
      
    } catch (error) {
      console.error('[Service Worker] Initialization error:', error);
    }
  }
  
  /**
   * Handle incoming messages
   */
  async handleMessage(request, sender) {
    // Map legacy message types
    const messageType = this.mapLegacyMessageType(request);
    
    console.log(`[Service Worker] Handling message: ${messageType}`);
    
    try {
      switch (messageType) {
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
          console.log(`[Service Worker] User joined: ${request.speakerName} (${request.userId})`);
          return { acknowledged: true };
          
        case 'userLeft':
          console.log(`[Service Worker] User left: ${request.speakerName} (${request.userId})`);
          await this.handleUserLeft(request.userId);
          return { acknowledged: true };
          
        case 'reconnectAudio':
          console.log('[Service Worker] Handling VTF reconnect');
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
          
        default:
          throw new Error(`Unknown message type: ${messageType}`);
      }
    } catch (error) {
      console.error('[Service Worker] Error handling message:', error);
      throw error;
    }
  }
  
  /**
   * Map legacy message types to new ones
   */
  mapLegacyMessageType(request) {
    // Handle legacy audioData format
    if (request.type === 'audioData' && request.audioData) {
      request.type = 'audioChunk';
      request.chunk = request.audioData;
      
      // Extract userId from streamId
      if (request.streamId && request.streamId.includes('msRemAudio-')) {
        request.userId = request.streamId.replace('msRemAudio-', '');
      }
      
      // Use chunkNumber if no userId
      if (!request.userId && request.chunkNumber) {
        request.userId = 'legacy-user';
      }
    }
    
    return this.legacyMessageMap[request.type] || request.type;
  }
  
  /**
   * Handle audio chunk from content script
   */
  async handleAudioChunk(request) {
    const { userId, chunk, timestamp, sampleRate = 16000 } = request;
    
    if (!userId || !chunk || chunk.length === 0) {
      console.warn('[Service Worker] Invalid audio chunk received');
      return { received: false, error: 'Invalid audio data' };
    }
    
    this.stats.chunksReceived++;
    this.stats.bytesProcessed += chunk.length * 2; // Int16 = 2 bytes
    
    // Get or create buffer for user
    if (!this.userBuffers.has(userId)) {
      console.log(`[Service Worker] Creating buffer for user: ${userId}`);
      this.userBuffers.set(userId, new UserBufferManager(userId, this.config));
    }
    
    const buffer = this.userBuffers.get(userId);
    
    // Convert Int16 back to Float32 for processing
    const float32Data = this.int16ToFloat32(chunk);
    
    // Add to buffer
    buffer.addChunk(float32Data, timestamp);
    
    console.log(`[Service Worker] Added chunk for ${userId}: ${chunk.length} samples, buffer: ${buffer.totalSamples} total`);
    
    // Check if ready to transcribe
    if (buffer.isReadyToTranscribe()) {
      console.log(`[Service Worker] Buffer ready for transcription: ${userId}`);
      // Don't await - let it process in background
      this.transcribeUserBuffer(userId);
    }
    
    // Send buffer status update
    this.broadcastBufferStatus();
    
    return { 
      received: true, 
      bufferSize: buffer.totalSamples,
      bufferDuration: buffer.totalSamples / sampleRate
    };
  }
  
  /**
   * Transcribe a user's buffer
   */
  async transcribeUserBuffer(userId) {
    // Prevent concurrent transcriptions for same user
    if (this.activeTranscriptions.has(userId)) {
      console.log(`[Service Worker] Transcription already active for ${userId}`);
      return;
    }
    
    const buffer = this.userBuffers.get(userId);
    if (!buffer || !buffer.hasData()) {
      console.log(`[Service Worker] No data in buffer for ${userId}`);
      return;
    }
    
    try {
      // Extract audio data
      const audioData = buffer.extractForTranscription();
      if (!audioData || audioData.samples.length === 0) return;
      
      console.log(`[Service Worker] Starting transcription for ${userId}: ${audioData.duration.toFixed(2)}s of audio`);
      
      // Mark as active
      const transcriptionPromise = this.performTranscription(userId, audioData);
      this.activeTranscriptions.set(userId, transcriptionPromise);
      
      // Wait for completion
      await transcriptionPromise;
      
      // Success - reset retry count
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
  
  /**
   * Perform transcription via Whisper API
   */
  async performTranscription(userId, audioData) {
    if (!this.apiKey) {
      throw new Error('No API key configured');
    }
    
    // Convert to WAV format
    const wavBlob = this.createWAV(audioData.samples, 16000);
    console.log(`[Service Worker] Created WAV blob: ${wavBlob.size} bytes`);
    
    // Create form data
    const formData = new FormData();
    formData.append('file', wavBlob, 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');
    formData.append('response_format', 'json');
    
    // Add context prompt for better accuracy
    const speaker = this.getSpeakerName(userId);
    formData.append('prompt', `Speaker: ${speaker}. Virtual Trading Floor audio.`);
    
    console.log(`[Service Worker] Calling Whisper API for ${speaker}...`);
    
    // Call Whisper API
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
    
    const result = await response.json();
    console.log(`[Service Worker] Whisper API response:`, result);
    
    if (result.text && result.text.trim()) {
      const transcription = {
        userId,
        text: result.text.trim(),
        speaker: speaker,
        timestamp: audioData.startTime,
        duration: audioData.duration
      };
      
      this.stats.transcriptionsSent++;
      this.stats.totalDuration += transcription.duration;
      
      console.log(`[Service Worker] Transcription complete for ${speaker}: "${transcription.text}"`);
      
      // Store in history
      await this.storeTranscription(transcription);
      
      // Broadcast to all tabs
      this.broadcastTranscription(transcription);
    } else {
      console.log(`[Service Worker] No text in transcription result for ${userId}`);
    }
  }
  
  /**
   * Create WAV file from audio samples
   */
  createWAV(float32Array, sampleRate) {
    const length = float32Array.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);
    
    // Convert samples
    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }
  
  /**
   * Convert Int16 array to Float32
   */
  int16ToFloat32(int16Array) {
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
    }
    return float32Array;
  }
  
  /**
   * Get speaker name for userId
   */
  getSpeakerName(userId) {
    // Check custom mapping
    if (this.speakerMap.has(userId)) {
      return this.speakerMap.get(userId);
    }
    
    // Generate from userId
    const shortId = userId.substring(0, 6).toUpperCase();
    return `Speaker-${shortId}`;
  }
  
  /**
   * Update speaker mapping
   */
  async updateSpeakerMapping(userId, speakerName) {
    this.speakerMap.set(userId, speakerName);
    
    // Save to storage
    const mappings = Object.fromEntries(this.speakerMap);
    await chrome.storage.local.set({ speakerMappings: mappings });
    
    console.log(`[Service Worker] Updated speaker mapping: ${userId} → ${speakerName}`);
  }
  
  /**
   * Store transcription in history
   */
  async storeTranscription(transcription) {
    try {
      // Get existing transcriptions
      const { transcriptions = [] } = await chrome.storage.local.get('transcriptions');
      
      // Add new transcription
      transcriptions.push({
        ...transcription,
        id: `${transcription.timestamp}-${transcription.userId}`,
        storedAt: Date.now()
      });
      
      // Keep only last N transcriptions
      if (transcriptions.length > this.config.maxTranscriptionHistory) {
        transcriptions.splice(0, transcriptions.length - this.config.maxTranscriptionHistory);
      }
      
      // Save back
      await chrome.storage.local.set({ transcriptions });
      
    } catch (error) {
      console.error('[Service Worker] Error storing transcription:', error);
    }
  }
  
  /**
   * Get transcription history
   */
  async getTranscriptionHistory() {
    const { transcriptions = [] } = await chrome.storage.local.get('transcriptions');
    return { transcriptions };
  }
  
  /**
   * Broadcast transcription to all VTF tabs
   */
  broadcastTranscription(transcription) {
    chrome.tabs.query({ url: '*://vtf.t3live.com/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'transcription',
          data: transcription
        }).catch(error => {
          // Tab might not have content script
          if (!error.message.includes('Could not establish connection')) {
            console.error(`[Service Worker] Error sending to tab ${tab.id}:`, error);
          }
        });
      });
    });
  }
  
  /**
   * Broadcast buffer status
   */
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
    
    // Send to all VTF tabs
    chrome.tabs.query({ url: '*://vtf.t3live.com/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, status).catch(() => {});
      });
    });
  }
  
  /**
   * Get total buffer seconds across all users
   */
  getTotalBufferSeconds() {
    let total = 0;
    this.userBuffers.forEach(buffer => {
      total += buffer.totalSamples / 16000;
    });
    return total;
  }
  
  /**
   * Get detailed buffer information
   */
  getBufferDetails() {
    const details = {};
    this.userBuffers.forEach((buffer, userId) => {
      const duration = buffer.totalSamples / 16000;
      if (duration > 0) {
        details[userId] = duration;
      }
    });
    return details;
  }
  
  /**
   * Handle transcription error with retry
   */
  handleTranscriptionError(userId, error) {
    this.stats.errors++;
    this.lastError.set(userId, error);
    
    const retries = this.retryCount.get(userId) || 0;
    
    // Check if we should retry
    if (retries >= this.config.maxRetries) {
      console.error(`[Service Worker] Max retries reached for ${userId}, clearing buffer`);
      this.userBuffers.get(userId)?.clear();
      this.retryCount.delete(userId);
      return;
    }
    
    // Don't retry for API key errors
    if (error.message.includes('API key')) {
      console.error('[Service Worker] API key error, not retrying');
      return;
    }
    
    // Calculate exponential backoff
    const backoff = Math.min(
      this.config.initialBackoff * Math.pow(2, retries),
      this.config.maxBackoff
    );
    
    console.log(`[Service Worker] Retrying ${userId} in ${backoff}ms (attempt ${retries + 1}/${this.config.maxRetries})`);
    
    this.retryCount.set(userId, retries + 1);
    
    setTimeout(() => {
      this.transcribeUserBuffer(userId);
    }, backoff);
  }
  
  /**
   * Handle user leaving
   */
  async handleUserLeft(userId) {
    // Process any remaining audio
    const buffer = this.userBuffers.get(userId);
    if (buffer && buffer.hasData()) {
      console.log(`[Service Worker] Processing remaining audio for ${userId} before removal`);
      await this.transcribeUserBuffer(userId);
    }
    
    // Clean up
    this.userBuffers.delete(userId);
    this.activeTranscriptions.delete(userId);
    this.retryCount.delete(userId);
    this.lastError.delete(userId);
  }
  
  /**
   * Handle VTF reconnect
   */
  async handleReconnect() {
    console.log('[Service Worker] Processing buffers before reconnect');
    
    // Flush all buffers
    await this.flushAllBuffers();
    
    // Clear all state
    this.userBuffers.clear();
    this.activeTranscriptions.clear();
    this.retryCount.clear();
    this.lastError.clear();
    
    console.log('[Service Worker] Reconnect cleanup complete');
  }
  
  /**
   * Flush all user buffers
   */
  async flushAllBuffers() {
    console.log('[Service Worker] Flushing all buffers');
    
    const promises = [];
    
    this.userBuffers.forEach((buffer, userId) => {
      if (buffer.hasData()) {
        promises.push(this.transcribeUserBuffer(userId));
      }
    });
    
    if (promises.length > 0) {
      console.log(`[Service Worker] Processing ${promises.length} remaining buffers`);
      await Promise.allSettled(promises);
    }
  }
  
  /**
   * Start capture
   */
  async handleStartCapture() {
    console.log('[Service Worker] Starting capture');
    this.stats.captureStartTime = Date.now();
    
    // Clear any stale data
    this.userBuffers.clear();
    this.activeTranscriptions.clear();
    this.retryCount.clear();
    this.lastError.clear();
    
    return { status: 'started' };
  }
  
  /**
   * Stop capture
   */
  async handleStopCapture() {
    console.log('[Service Worker] Stopping capture');
    
    // Process remaining buffers
    await this.flushAllBuffers();
    
    this.stats.captureStartTime = null;
    
    return { status: 'stopped' };
  }
  
  /**
   * Set API key
   */
  async setApiKey(apiKey) {
    if (!apiKey) {
      throw new Error('API key is required');
    }
    
    this.apiKey = apiKey;
    await chrome.storage.local.set({ openaiApiKey: apiKey });
    
    console.log('[Service Worker] API key updated');
    
    return { status: 'saved' };
  }
  
  /**
   * Get service status
   */
  getStatus() {
    const bufferStats = Array.from(this.userBuffers.entries()).map(([userId, buffer]) => ({
      userId,
      speaker: this.getSpeakerName(userId),
      samples: buffer.totalSamples,
      duration: buffer.totalSamples / 16000,
      lastActivity: Date.now() - buffer.lastActivity,
      isActive: this.activeTranscriptions.has(userId)
    }));
    
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
      }))
    };
  }
  
  /**
   * Keep service worker alive
   */
  startKeepAlive() {
    // Clear any existing timer
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }
    
    // Send periodic message to keep service worker alive during capture
    this.keepAliveTimer = setInterval(() => {
      if (this.stats.captureStartTime) {
        console.log('[Service Worker] Keep-alive ping');
        // Just accessing chrome.storage is enough to keep it alive
        chrome.storage.local.get(null, () => {});
      }
    }, this.config.keepAliveInterval);
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    console.log('[Service Worker] Destroying service');
    
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }
    
    this.userBuffers.clear();
    this.activeTranscriptions.clear();
    this.retryCount.clear();
    this.lastError.clear();
  }
}

/**
 * User buffer manager class
 */
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
  
  /**
   * Add audio chunk to buffer
   */
  addChunk(samples, timestamp) {
    this.chunks.push({
      samples,
      timestamp: timestamp || Date.now(),
      addedAt: Date.now()
    });
    
    this.totalSamples += samples.length;
    this.lastActivity = Date.now();
    
    // Reset silence timer
    this.resetSilenceTimer();
    
    // Trim if too large
    this.trimBuffer();
  }
  
  /**
   * Check if buffer is ready for transcription
   */
  isReadyToTranscribe() {
    const duration = this.totalSamples / 16000;
    return duration >= this.config.bufferDuration;
  }
  
  /**
   * Check if buffer has data
   */
  hasData() {
    return this.totalSamples > 0;
  }
  
  /**
   * Extract audio for transcription
   */
  extractForTranscription() {
    if (this.chunks.length === 0) return null;
    
    // Merge all chunks into single array
    const allSamples = [];
    const startTime = this.chunks[0].timestamp;
    
    this.chunks.forEach(chunk => {
      allSamples.push(...chunk.samples);
    });
    
    // Clear buffer
    this.chunks = [];
    this.totalSamples = 0;
    
    return {
      samples: allSamples,
      startTime,
      duration: allSamples.length / 16000
    };
  }
  
  /**
   * Reset silence timer
   */
  resetSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }
    
    // Set new timer
    this.silenceTimer = setTimeout(() => {
      if (this.hasData()) {
        console.log(`[UserBuffer] Silence timeout for ${this.userId} - triggering transcription`);
        // Trigger transcription via runtime message
        chrome.runtime.sendMessage({
          type: 'forceTranscribe',
          userId: this.userId
        }).catch(() => {});
      }
    }, this.config.silenceTimeout);
  }
  
  /**
   * Trim buffer if too large
   */
  trimBuffer() {
    const maxSamples = this.config.maxBufferDuration * 16000;
    
    while (this.totalSamples > maxSamples && this.chunks.length > 1) {
      const removed = this.chunks.shift();
      this.totalSamples -= removed.samples.length;
      console.warn(`[UserBuffer] Trimmed buffer for ${this.userId} - removed ${removed.samples.length} samples`);
    }
  }
  
  /**
   * Clear buffer
   */
  clear() {
    this.chunks = [];
    this.totalSamples = 0;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
  
  /**
   * Get total samples
   */
  getTotalSamples() {
    return this.totalSamples;
  }
}

// Create service instance
let vtfService = null;

// Service worker activation
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activated');
  event.waitUntil(clients.claim());
});

// Service worker installation
self.addEventListener('install', event => {
  console.log('[Service Worker] Installed');
  self.skipWaiting();
});

// Handle chrome runtime messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Initialize service on first message
  if (!vtfService) {
    vtfService = new VTFTranscriptionService();
    vtfService.init();
  }
  
  // Handle message asynchronously
  vtfService.handleMessage(request, sender)
    .then(response => sendResponse(response))
    .catch(error => {
      console.error('[Service Worker] Message handling error:', error);
      sendResponse({ error: error.message });
    });
    
  return true; // Keep channel open for async response
});

// Handle internal messages (like forceTranscribe)
self.addEventListener('message', event => {
  if (event.data.type === 'forceTranscribe' && vtfService) {
    const { userId } = event.data;
    console.log(`[Service Worker] Force transcribe requested for ${userId}`);
    vtfService.transcribeUserBuffer(userId);
  }
});

// Log when service worker starts
console.log('[Service Worker] VTF Transcription Service Worker loaded at', new Date().toISOString());