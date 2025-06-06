

class VTFTranscriptionService {
  constructor() {
    
    this.userBuffers = new Map();          
    this.activeTranscriptions = new Map(); 
    
    
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
      keepAliveInterval: 20000           
    };
    
    
    this.apiKey = null;
    this.whisperEndpoint = 'https:
    
    
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
    
    
    this.legacyMessageMap = {
      'audioData': 'audioChunk',
      'start_capture': 'startCapture',
      'stop_capture': 'stopCapture',
      'getTranscriptions': 'getStatus'
    };
    
    
    this.keepAliveTimer = null;
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
    
    const messageType = this.mapLegacyMessageType(request);
    
    
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
          
        default:
          throw new Error(`Unknown message type: ${messageType}`);
      }
    } catch (error) {
      console.error('[Service Worker] Error handling message:', error);
      throw error;
    }
  }
  
  
  mapLegacyMessageType(request) {
    
    if (request.type === 'audioData' && request.audioData) {
      request.type = 'audioChunk';
      request.chunk = request.audioData;
      
      
      if (request.streamId && request.streamId.includes('msRemAudio-')) {
        request.userId = request.streamId.replace('msRemAudio-', '');
      }
      
      
      if (!request.userId && request.chunkNumber) {
        request.userId = 'legacy-user';
      }
    }
    
    return this.legacyMessageMap[request.type] || request.type;
  }
  
  
  async handleAudioChunk(request) {
    const { userId, chunk, timestamp, sampleRate = 16000 } = request;
    
    if (!userId || !chunk || chunk.length === 0) {
      
      return { received: false, error: 'Invalid audio data' };
    }
    
    this.stats.chunksReceived++;
    this.stats.bytesProcessed += chunk.length * 2; 
    
    
    if (!this.userBuffers.has(userId)) {
      
      this.userBuffers.set(userId, new UserBufferManager(userId, this.config));
    }
    
    const buffer = this.userBuffers.get(userId);
    
    
    const float32Data = this.int16ToFloat32(chunk);
    
    
    buffer.addChunk(float32Data, timestamp);
    
    
    
    if (buffer.isReadyToTranscribe()) {
      
      
      this.transcribeUserBuffer(userId);
    }
    
    
    this.broadcastBufferStatus();
    
    return { 
      received: true, 
      bufferSize: buffer.totalSamples,
      bufferDuration: buffer.totalSamples / sampleRate
    };
  }
  
  
  async transcribeUserBuffer(userId) {
    
    if (this.activeTranscriptions.has(userId)) {
      
      return;
    }
    
    const buffer = this.userBuffers.get(userId);
    if (!buffer || !buffer.hasData()) {
      
      return;
    }
    
    try {
      
      const audioData = buffer.extractForTranscription();
      if (!audioData || audioData.samples.length === 0) return;
      
      
      
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
  
  
  async performTranscription(userId, audioData) {
    if (!this.apiKey) {
      throw new Error('No API key configured');
    }
    
    
    const wavBlob = this.createWAV(audioData.samples, 16000);
    
    
    const formData = new FormData();
    formData.append('file', wavBlob, 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');
    formData.append('response_format', 'json');
    
    
    const speaker = this.getSpeakerName(userId);
    formData.append('prompt', `Speaker: ${speaker}. Virtual Trading Floor audio.`);
    
    
    
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
      
      
      
      await this.storeTranscription(transcription);
      
      
      this.broadcastTranscription(transcription);
    } else {
      
    }
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
      float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
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
    chrome.tabs.query({ url: '*:
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
    
    
    chrome.tabs.query({ url: '*:
  getTotalBufferSeconds() {
    let total = 0;
    this.userBuffers.forEach(buffer => {
      total += buffer.totalSamples / 16000;
    });
    return total;
  }
  
  
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
    
    
    this.userBuffers.clear();
    this.activeTranscriptions.clear();
    this.retryCount.clear();
    this.lastError.clear();
    
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
    
    this.apiKey = apiKey;
    await chrome.storage.local.set({ openaiApiKey: apiKey });
    
    
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
  
  
  isReadyToTranscribe() {
    const duration = this.totalSamples / 16000;
    return duration >= this.config.bufferDuration;
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (!vtfService) {
    vtfService = new VTFTranscriptionService();
    vtfService.init();
  }
  
  
  vtfService.handleMessage(request, sender)
    .then(response => sendResponse(response))
    .catch(error => {
      console.error('[Service Worker] Message handling error:', error);
      sendResponse({ error: error.message });
    });
    
  return true; 
});

self.addEventListener('message', event => {
  if (event.data.type === 'forceTranscribe' && vtfService) {
    const { userId } = event.data;
    
    vtfService.transcribeUserBuffer(userId);
  }
});

