/**
 * AudioDataTransfer - Efficient audio data transfer to service worker
 * 
 * This module handles the conversion, chunking, and transfer of audio data
 * from the capture module to the service worker. It converts Float32 audio
 * to Int16 for 50% size reduction and manages reliable message passing.
 * 
 * @module audio-data-transfer
 */

export class AudioDataTransfer {
    constructor(options = {}) {
      // Configuration
      this.config = {
        chunkSize: 16384,           // 1 second at 16kHz
        maxPendingSize: 163840,     // 10 seconds worth
        retryAttempts: 3,           // Retry failed sends
        retryDelay: 1000,           // ms between retries
        enableCompression: false,    // Future: compression support
        ...options
      };
      
      // Current chunk size (can be updated)
      this.CHUNK_SIZE = this.config.chunkSize;
      
      // Pending audio buffers per user
      this.pendingChunks = new Map();
      
      // Transfer statistics
      this.transferStats = {
        bytesSent: 0,
        chunksSent: 0,
        errors: 0,
        retries: 0,
        conversions: 0,
        droppedSamples: 0
      };
      
      // Per-user statistics
      this.userStats = new Map();
      
      // Failed chunks for retry
      this.failedChunks = [];
      
      // Sequence number for ordering
      this.sequenceNumber = 0;
      
      // Extension state
      this.extensionValid = true;
      this.lastError = null;
      
      // Check extension validity
      this.checkExtensionValidity();
      
      // Set up periodic tasks
      this.setupPeriodicTasks();
    }
    
    /**
     * Send audio data for a user
     * @param {string} userId - User identifier
     * @param {Float32Array|Array} samples - Audio samples to send
     */
    sendAudioData(userId, samples) {
      try {
        // Validate inputs
        if (!userId || typeof userId !== 'string') {
          throw new Error('Invalid userId');
        }
        
        if (!samples || !samples.length) {
          return; // Nothing to send
        }
        
        // Convert to Float32Array if needed
        const float32Samples = samples instanceof Float32Array 
          ? samples 
          : new Float32Array(samples);
        
        // Convert to Int16 for efficiency
        const int16Data = this.float32ToInt16(float32Samples);
        this.transferStats.conversions++;
        
        // Get or create pending buffer
        if (!this.pendingChunks.has(userId)) {
          this.pendingChunks.set(userId, []);
          this.userStats.set(userId, {
            chunksSent: 0,
            bytesSent: 0,
            errors: 0,
            lastSendTime: null
          });
        }
        
        const pending = this.pendingChunks.get(userId);
        
        // Check pending buffer size limit
        if (pending.length + int16Data.length > this.config.maxPendingSize) {
          const dropped = pending.length + int16Data.length - this.config.maxPendingSize;
          console.warn(`[Data Transfer] Dropping ${dropped} samples for ${userId} due to buffer overflow`);
          this.transferStats.droppedSamples += dropped;
          
          // Remove oldest samples
          pending.splice(0, dropped);
        }
        
        // Add new samples
        pending.push(...int16Data);
        
        // Send complete chunks
        while (pending.length >= this.CHUNK_SIZE) {
          const chunk = pending.splice(0, this.CHUNK_SIZE);
          this.sendChunk(userId, chunk);
        }
        
      } catch (error) {
        console.error('[Data Transfer] Error processing audio:', error);
        this.transferStats.errors++;
        this.lastError = error;
      }
    }
    
    /**
     * Send a complete chunk via Chrome messaging
     * @param {string} userId - User identifier
     * @param {Array} chunk - Int16 audio chunk
     * @param {number} retryCount - Current retry attempt
     */
    sendChunk(userId, chunk, retryCount = 0) {
      // Check extension validity
      if (!this.extensionValid || !chrome.runtime?.id) {
        console.error('[Data Transfer] Extension context invalid');
        this.queueFailedChunk(userId, chunk);
        return;
      }
      
      const message = {
        type: 'audioChunk',
        userId,
        chunk: Array.from(chunk), // Ensure it's a regular array
        timestamp: Date.now(),
        sampleRate: 16000,
        sequence: this.sequenceNumber++
      };
      
      try {
        chrome.runtime.sendMessage(message, response => {
          if (chrome.runtime.lastError) {
            console.error('[Data Transfer] Send error:', chrome.runtime.lastError);
            this.handleSendError(userId, chunk, retryCount);
          } else {
            // Success
            this.handleSendSuccess(userId, chunk);
          }
        });
      } catch (error) {
        console.error('[Data Transfer] Failed to send chunk:', error);
        this.handleSendError(userId, chunk, retryCount);
      }
    }
    
    /**
     * Handle successful chunk send
     * @private
     */
    handleSendSuccess(userId, chunk) {
      this.transferStats.chunksSent++;
      this.transferStats.bytesSent += chunk.length * 2;
      
      const userStat = this.userStats.get(userId);
      if (userStat) {
        userStat.chunksSent++;
        userStat.bytesSent += chunk.length * 2;
        userStat.lastSendTime = Date.now();
      }
    }
    
    /**
     * Handle failed chunk send
     * @private
     */
    handleSendError(userId, chunk, retryCount) {
      this.transferStats.errors++;
      
      const userStat = this.userStats.get(userId);
      if (userStat) {
        userStat.errors++;
      }
      
      // Retry logic
      if (retryCount < this.config.retryAttempts) {
        this.transferStats.retries++;
        console.log(`[Data Transfer] Retrying chunk for ${userId} (attempt ${retryCount + 1})`);
        
        setTimeout(() => {
          this.sendChunk(userId, chunk, retryCount + 1);
        }, this.config.retryDelay * (retryCount + 1));
      } else {
        console.error(`[Data Transfer] Failed to send chunk for ${userId} after ${retryCount} retries`);
        this.queueFailedChunk(userId, chunk);
      }
    }
    
    /**
     * Queue failed chunk for later retry
     * @private
     */
    queueFailedChunk(userId, chunk) {
      this.failedChunks.push({
        userId,
        chunk,
        timestamp: Date.now()
      });
      
      // Limit failed chunks queue
      if (this.failedChunks.length > 100) {
        const dropped = this.failedChunks.splice(0, 50);
        console.warn(`[Data Transfer] Dropped ${dropped.length} failed chunks`);
      }
    }
    
    /**
     * Convert Float32Array to Int16Array
     * @param {Float32Array} float32Array - Input samples [-1, 1]
     * @returns {Int16Array} - Output samples [-32768, 32767]
     */
    float32ToInt16(float32Array) {
      const int16Array = new Int16Array(float32Array.length);
      
      for (let i = 0; i < float32Array.length; i++) {
        // Clamp to [-1, 1]
        const clamped = Math.max(-1, Math.min(1, float32Array[i]));
        
        // Convert to Int16 range
        // Note: We use different scaling for negative vs positive to avoid overflow
        int16Array[i] = clamped < 0 
          ? Math.floor(clamped * 0x8000)  // -32768
          : Math.floor(clamped * 0x7FFF); // 32767
      }
      
      return int16Array;
    }
    
    /**
     * Force send any pending data for a user
     * @param {string} userId - User identifier
     * @returns {boolean} - True if data was flushed
     */
    flush(userId) {
      const pending = this.pendingChunks.get(userId);
      if (!pending || pending.length === 0) {
        return false;
      }
      
      console.log(`[Data Transfer] Flushing ${pending.length} samples for ${userId}`);
      
      // Send whatever we have, even if incomplete chunk
      if (pending.length > 0) {
        // Pad to chunk size if needed
        while (pending.length < this.CHUNK_SIZE) {
          pending.push(0);
        }
        
        const chunk = pending.splice(0, this.CHUNK_SIZE);
        this.sendChunk(userId, chunk);
      }
      
      return true;
    }
    
    /**
     * Force send all pending data
     * @returns {number} - Number of users flushed
     */
    flushAll() {
      console.log('[Data Transfer] Flushing all pending data');
      
      let flushedCount = 0;
      for (const userId of this.pendingChunks.keys()) {
        if (this.flush(userId)) {
          flushedCount++;
        }
      }
      
      // Also retry failed chunks
      const failedToRetry = [...this.failedChunks];
      this.failedChunks = [];
      
      failedToRetry.forEach(({ userId, chunk }) => {
        console.log(`[Data Transfer] Retrying failed chunk for ${userId}`);
        this.sendChunk(userId, chunk);
      });
      
      return flushedCount;
    }
    
    /**
     * Update chunk size
     * @param {number} size - New chunk size in samples
     */
    setChunkSize(size) {
      if (size < 1024 || size > 65536) {
        throw new Error('Chunk size must be between 1024 and 65536');
      }
      
      console.log(`[Data Transfer] Changing chunk size from ${this.CHUNK_SIZE} to ${size}`);
      this.CHUNK_SIZE = size;
    }
    
    /**
     * Set maximum pending buffer size
     * @param {number} size - Max size in samples
     */
    setMaxPendingSize(size) {
      if (size < this.CHUNK_SIZE) {
        throw new Error('Max pending size must be at least one chunk size');
      }
      
      this.config.maxPendingSize = size;
    }
    
    /**
     * Get transfer statistics
     * @returns {Object} - Statistics object
     */
    getStats() {
      const pendingInfo = Array.from(this.pendingChunks.entries()).map(([userId, pending]) => ({
        userId,
        pendingSamples: pending.length,
        pendingBytes: pending.length * 2
      }));
      
      const totalPendingBytes = pendingInfo.reduce((sum, info) => sum + info.pendingBytes, 0);
      
      return {
        ...this.transferStats,
        pendingUsers: this.pendingChunks.size,
        pendingBytes: totalPendingBytes,
        failedChunks: this.failedChunks.length,
        sequenceNumber: this.sequenceNumber,
        extensionValid: this.extensionValid,
        pendingDetails: pendingInfo
      };
    }
    
    /**
     * Get statistics for specific user
     * @param {string} userId - User identifier
     * @returns {Object|null} - User statistics
     */
    getUserStats(userId) {
      const userStat = this.userStats.get(userId);
      if (!userStat) {
        return null;
      }
      
      const pending = this.pendingChunks.get(userId) || [];
      
      return {
        ...userStat,
        pendingSamples: pending.length,
        pendingBytes: pending.length * 2,
        secondsSent: (userStat.bytesSent / 2) / 16000
      };
    }
    
    /**
     * Reset statistics
     */
    resetStats() {
      console.log('[Data Transfer] Resetting statistics');
      
      this.transferStats = {
        bytesSent: 0,
        chunksSent: 0,
        errors: 0,
        retries: 0,
        conversions: 0,
        droppedSamples: 0
      };
      
      this.userStats.clear();
      this.sequenceNumber = 0;
    }
    
    /**
     * Check if extension context is valid
     * @private
     */
    checkExtensionValidity() {
      try {
        this.extensionValid = !!(chrome.runtime && chrome.runtime.id);
      } catch (e) {
        this.extensionValid = false;
      }
      
      if (!this.extensionValid) {
        console.warn('[Data Transfer] Extension context not valid');
      }
    }
    
    /**
     * Set up periodic tasks
     * @private
     */
    setupPeriodicTasks() {
      // Check extension validity every 5 seconds
      this.validityCheckInterval = setInterval(() => {
        this.checkExtensionValidity();
      }, 5000);
      
      // Clean up old failed chunks every minute
      this.cleanupInterval = setInterval(() => {
        const now = Date.now();
        const maxAge = 60000; // 1 minute
        
        this.failedChunks = this.failedChunks.filter(item => {
          return now - item.timestamp < maxAge;
        });
      }, 60000);
    }
    
    /**
     * Get debug information
     * @returns {Object} - Debug state
     */
    debug() {
      const userDebug = {};
      for (const [userId, pending] of this.pendingChunks) {
        const stats = this.userStats.get(userId);
        userDebug[userId] = {
          pendingSamples: pending.length,
          stats: stats || {}
        };
      }
      
      return {
        config: { ...this.config },
        chunkSize: this.CHUNK_SIZE,
        stats: this.getStats(),
        users: userDebug,
        extensionValid: this.extensionValid,
        lastError: this.lastError ? this.lastError.message : null,
        failedChunksCount: this.failedChunks.length,
        oldestFailedChunk: this.failedChunks[0] 
          ? new Date(this.failedChunks[0].timestamp).toISOString() 
          : null
      };
    }
    
    /**
     * Clean up and destroy
     */
    destroy() {
      console.log('[Data Transfer] Destroying instance');
      
      // Clear intervals
      if (this.validityCheckInterval) {
        clearInterval(this.validityCheckInterval);
      }
      
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      
      // Flush all pending data
      this.flushAll();
      
      // Clear data structures
      this.pendingChunks.clear();
      this.userStats.clear();
      this.failedChunks = [];
      
      console.log('[Data Transfer] Destroyed successfully');
    }
  }
  
  // Export as default as well
  export default AudioDataTransfer;