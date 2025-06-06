

export class AudioDataTransfer {
    constructor(options = {}) {
      
      this.config = {
        chunkSize: 16384,           
        maxPendingSize: 163840,     
        retryAttempts: 3,           
        retryDelay: 1000,           
        enableCompression: false,    
        ...options
      };
      
      
      this.CHUNK_SIZE = this.config.chunkSize;
      
      
      this.pendingChunks = new Map();
      
      
      this.transferStats = {
        bytesSent: 0,
        chunksSent: 0,
        errors: 0,
        retries: 0,
        conversions: 0,
        droppedSamples: 0
      };
      
      
      this.userStats = new Map();
      
      
      this.failedChunks = [];
      
      
      this.sequenceNumber = 0;
      
      
      this.extensionValid = true;
      this.lastError = null;
      
      
      this.checkExtensionValidity();
      
      
      this.setupPeriodicTasks();
    }
    
    
    sendAudioData(userId, samples) {
      try {
        
        if (!userId || typeof userId !== 'string') {
          throw new Error('Invalid userId');
        }
        
        if (!samples || !samples.length) {
          return; 
        }
        
        
        const float32Samples = samples instanceof Float32Array 
          ? samples 
          : new Float32Array(samples);
        
        
        const int16Data = this.float32ToInt16(float32Samples);
        this.transferStats.conversions++;
        
        
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
        
        
        if (pending.length + int16Data.length > this.config.maxPendingSize) {
          const dropped = pending.length + int16Data.length - this.config.maxPendingSize;
          
          this.transferStats.droppedSamples += dropped;
          
          
          pending.splice(0, dropped);
        }
        
        
        pending.push(...int16Data);
        
        
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
    
    
    sendChunk(userId, chunk, retryCount = 0) {
      try {
        
        if (!this.extensionValid || !chrome.runtime?.id) {
          console.error('[Data Transfer] Extension context invalid');
          this.queueFailedChunk(userId, chunk);
          return;
        }
        
        const message = {
          type: 'audioChunk',
          userId,
          chunk: Array.from(chunk), 
          timestamp: Date.now(),
          sampleRate: 16000,
          sequence: this.sequenceNumber++
        };
        
        chrome.runtime.sendMessage(message, response => {
          if (chrome.runtime.lastError) {
            console.error('[Data Transfer] Send error:', chrome.runtime.lastError);
            this.handleSendError(userId, chunk, retryCount);
          } else {
            
            this.handleSendSuccess(userId, chunk);
          }
        });
      } catch (error) {
        console.error('[Data Transfer] Failed to send chunk:', error);
        this.handleSendError(userId, chunk, retryCount);
      }
    }
    
    
    handleSendSuccess(userId, chunk) {
      try {
        this.transferStats.chunksSent++;
        this.transferStats.bytesSent += chunk.length * 2;
        
        const userStat = this.userStats.get(userId);
        if (userStat) {
          userStat.chunksSent++;
          userStat.bytesSent += chunk.length * 2;
          userStat.lastSendTime = Date.now();
        }
      } catch (error) {
        console.error('[Data Transfer] Error handling send success:', error);
        this.transferStats.errors++;
        this.lastError = error;
      }
    }
    
    
    handleSendError(userId, chunk, retryCount) {
      try {
        this.transferStats.errors++;
        
        const userStat = this.userStats.get(userId);
        if (userStat) {
          userStat.errors++;
        }
        
        
        if (retryCount < this.config.retryAttempts) {
          this.transferStats.retries++;
          
          setTimeout(() => {
            this.sendChunk(userId, chunk, retryCount + 1);
          }, this.config.retryDelay * (retryCount + 1));
        } else {
          console.error(`[Data Transfer] Failed to send chunk for ${userId} after ${retryCount} retries`);
          this.queueFailedChunk(userId, chunk);
        }
      } catch (error) {
        console.error('[Data Transfer] Error handling send error:', error);
        this.transferStats.errors++;
        this.lastError = error;
      }
    }
    
    
    queueFailedChunk(userId, chunk) {
      try {
        this.failedChunks.push({
          userId,
          chunk,
          timestamp: Date.now()
        });
        
        
        if (this.failedChunks.length > 100) {
          const dropped = this.failedChunks.splice(0, 50);
          
        }
      } catch (error) {
        console.error('[Data Transfer] Error queueing failed chunk:', error);
        this.transferStats.errors++;
        this.lastError = error;
      }
    }
    
    
    float32ToInt16(float32Array) {
      try {
        const int16Array = new Int16Array(float32Array.length);
        
        for (let i = 0; i < float32Array.length; i++) {
          
          const clamped = Math.max(-1, Math.min(1, float32Array[i]));
          
          
          
          int16Array[i] = clamped < 0 
            ? Math.floor(clamped * 0x8000)  
            : Math.floor(clamped * 0x7FFF); 
        }
        
        return int16Array;
      } catch (error) {
        console.error('[Data Transfer] Error converting float32 to int16:', error);
        this.transferStats.errors++;
        this.lastError = error;
        return null;
      }
    }
    
    
    flush(userId) {
      try {
        const pending = this.pendingChunks.get(userId);
        if (!pending || pending.length === 0) {
          return false;
        }
        
        
        
        if (pending.length > 0) {
          
          while (pending.length < this.CHUNK_SIZE) {
            pending.push(0);
          }
          
          const chunk = pending.splice(0, this.CHUNK_SIZE);
          this.sendChunk(userId, chunk);
        }
        
        return true;
      } catch (error) {
        console.error('[Data Transfer] Error flushing data:', error);
        this.transferStats.errors++;
        this.lastError = error;
        return false;
      }
    }
    
    
    flushAll() {
      try {
        
        let flushedCount = 0;
        for (const userId of this.pendingChunks.keys()) {
          if (this.flush(userId)) {
            flushedCount++;
          }
        }
        
        
        const failedToRetry = [...this.failedChunks];
        this.failedChunks = [];
        
        failedToRetry.forEach(({ userId, chunk }) => {
          
          this.sendChunk(userId, chunk);
        });
        
        return flushedCount;
      } catch (error) {
        console.error('[Data Transfer] Error flushing all data:', error);
        this.transferStats.errors++;
        this.lastError = error;
        return 0;
      }
    }
    
    
    setChunkSize(size) {
      try {
        if (size < 1024 || size > 65536) {
          throw new Error('Chunk size must be between 1024 and 65536');
        }
        
        
        this.CHUNK_SIZE = size;
      } catch (error) {
        console.error('[Data Transfer] Error setting chunk size:', error);
        this.transferStats.errors++;
        this.lastError = error;
      }
    }
    
    
    setMaxPendingSize(size) {
      try {
        if (size < this.CHUNK_SIZE) {
          throw new Error('Max pending size must be at least one chunk size');
        }
        
        this.config.maxPendingSize = size;
      } catch (error) {
        console.error('[Data Transfer] Error setting max pending size:', error);
        this.transferStats.errors++;
        this.lastError = error;
      }
    }
    
    
    getStats() {
      try {
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
      } catch (error) {
        console.error('[Data Transfer] Error getting stats:', error);
        this.transferStats.errors++;
        this.lastError = error;
        return null;
      }
    }
    
    
    getUserStats(userId) {
      try {
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
      } catch (error) {
        console.error('[Data Transfer] Error getting user stats:', error);
        this.transferStats.errors++;
        this.lastError = error;
        return null;
      }
    }
    
    
    resetStats() {
      try {
        
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
      } catch (error) {
        console.error('[Data Transfer] Error resetting stats:', error);
        this.transferStats.errors++;
        this.lastError = error;
      }
    }
    
    
    checkExtensionValidity() {
      try {
        this.extensionValid = !!(chrome.runtime && chrome.runtime.id);
      } catch (e) {
        this.extensionValid = false;
      }
      
      if (!this.extensionValid) {
        
      }
    }
    
    
    setupPeriodicTasks() {
      try {
        
        this.validityCheckInterval = setInterval(() => {
          this.checkExtensionValidity();
        }, 5000);
        
        
        this.cleanupInterval = setInterval(() => {
          const now = Date.now();
          const maxAge = 60000; 
          
          this.failedChunks = this.failedChunks.filter(item => {
            return now - item.timestamp < maxAge;
          });
        }, 60000);
      } catch (error) {
        console.error('[Data Transfer] Error setting up periodic tasks:', error);
        this.transferStats.errors++;
        this.lastError = error;
      }
    }
    
    
    debug() {
      try {
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
      } catch (error) {
        console.error('[Data Transfer] Error getting debug info:', error);
        this.transferStats.errors++;
        this.lastError = error;
        return null;
      }
    }
    
    
    destroy() {
      try {
        
        
        if (this.validityCheckInterval) {
          clearInterval(this.validityCheckInterval);
        }
        
        if (this.cleanupInterval) {
          clearInterval(this.cleanupInterval);
        }
        
        
        this.flushAll();
        
        
        this.pendingChunks.clear();
        this.userStats.clear();
        this.failedChunks = [];
        
        
      } catch (error) {
        console.error('[Data Transfer] Error destroying instance:', error);
        this.transferStats.errors++;
        this.lastError = error;
      }
    }
  }
  
  
  export default AudioDataTransfer;