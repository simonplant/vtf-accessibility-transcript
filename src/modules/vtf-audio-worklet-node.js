export class VTFAudioWorkletNode {
    constructor(context, userId, options = {}) {
      
      if (!context || !(context instanceof AudioContext)) {
        throw new Error('[Audio Worklet] Invalid AudioContext provided');
      }
      
      if (!userId || typeof userId !== 'string') {
        throw new Error('[Audio Worklet] Invalid userId provided');
      }
      
      
      this.context = context;
      this.userId = userId;
      this.options = {
        bufferSize: 4096,
        silenceThreshold: 0.001,
        workletPath: 'audio-worklet.js',
        ...options
      };
      
      
      this.isInitialized = false;
      this.node = null;
      this.audioDataCallback = null;
      this.statsCallback = null;
      
      
      this.stats = {
        initialized: false,
        messagesReceived: 0,
        audioChunksReceived: 0,
        lastMessageTime: null,
        initTime: null
      };
      
      
      this.lastError = null;
    }
    
    
    async initialize() {
      if (this.isInitialized) {
        
        return;
      }
      
      
      try {
        
        if (!this.context.audioWorklet) {
          throw new Error('AudioWorklet not supported in this browser');
        }
        
        
        let workletUrl = this.options.workletPath;
        
        
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
          workletUrl = chrome.runtime.getURL('workers/audio-worklet.js');
          console.log('[Audio Worklet] Loading from Chrome extension:', workletUrl);
        }
        
        
        
        await this.context.audioWorklet.addModule(workletUrl);
        
        
        
        this.node = new AudioWorkletNode(this.context, 'vtf-audio-processor', {
          processorOptions: {
            userId: this.userId,
            bufferSize: this.options.bufferSize,
            silenceThreshold: this.options.silenceThreshold
          },
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers'
        });
        
        
        this.node.port.onmessage = (event) => {
          this.handleWorkletMessage(event.data);
        };
        
        
        this.isInitialized = true;
        this.stats.initTime = Date.now();
        
        
      } catch (error) {
        this.lastError = error;
        console.error('[Audio Worklet] Initialization failed:', error);
        throw error;
      }
    }
    
    
    connect(destination) {
      if (!this.isInitialized || !this.node) {
        throw new Error('[Audio Worklet] Not initialized');
      }
      
      this.node.connect(destination);
      
    }
    
    
    disconnect() {
      if (!this.node) {
        return;
      }
      
      try {
        this.node.disconnect();
        
      } catch (error) {
        
        console.warn('[Audio Worklet] Disconnect warning:', error.message);
      }
    }
    
    
    onAudioData(callback) {
      if (typeof callback !== 'function') {
        throw new Error('[Audio Worklet] Callback must be a function');
      }
      
      this.audioDataCallback = callback;
    }
    
    
    onStats(callback) {
      if (typeof callback !== 'function') {
        throw new Error('[Audio Worklet] Callback must be a function');
      }
      
      this.statsCallback = callback;
    }
    
    
    async getStats() {
      if (!this.isInitialized || !this.node) {
        return this.stats;
      }
      
      return new Promise((resolve) => {
        
        const originalCallback = this.statsCallback;
        this.statsCallback = (stats) => {
          this.statsCallback = originalCallback;
          resolve({
            ...this.stats,
            processor: stats
          });
        };
        
        
        this.node.port.postMessage({ command: 'getStats' });
        
        
        setTimeout(() => {
          this.statsCallback = originalCallback;
          resolve(this.stats);
        }, 1000);
      });
    }
    
    
    updateConfig(config) {
      if (!this.isInitialized || !this.node) {
        throw new Error('[Audio Worklet] Not initialized');
      }
      
      this.node.port.postMessage({
        command: 'updateConfig',
        config: config
      });
      
      
      Object.assign(this.options, config);
    }
    
    
    flush() {
      if (!this.isInitialized || !this.node) {
        return;
      }
      
      this.node.port.postMessage({ command: 'flush' });
    }
    
    
    handleWorkletMessage(data) {
      this.stats.messagesReceived++;
      this.stats.lastMessageTime = Date.now();
      
      switch (data.type) {
        case 'initialized':
          this.stats.initialized = true;
          
          break;
          
        case 'audioData':
          this.stats.audioChunksReceived++;
          if (this.audioDataCallback) {
            try {
              this.audioDataCallback({
                userId: data.userId,
                samples: data.samples,
                timestamp: data.timestamp,
                maxSample: data.maxSample,
                rms: data.rms,
                chunkIndex: data.chunkIndex
              });
            } catch (error) {
              console.error('[Audio Worklet] Error in audio callback:', error);
            }
          }
          break;
          
        case 'stats':
          if (this.statsCallback) {
            try {
              this.statsCallback(data);
            } catch (error) {
              console.error('[Audio Worklet] Error in stats callback:', error);
            }
          }
          break;
          
        default:
          
      }
    }
    
    
    debug() {
      return {
        userId: this.userId,
        isInitialized: this.isInitialized,
        hasNode: !!this.node,
        options: { ...this.options },
        stats: { ...this.stats },
        lastError: this.lastError ? this.lastError.message : null,
        contextState: this.context ? this.context.state : 'no-context',
        sampleRate: this.context ? this.context.sampleRate : null
      };
    }
    
    
    destroy() {
      
      
      if (this.node) {
        this.node.port.postMessage({ command: 'stop' });
        
        
        this.disconnect();
        
        
        this.node = null;
      }
      
      
      this.audioDataCallback = null;
      this.statsCallback = null;
      
      
      this.isInitialized = false;
      
      
    }
  }
  
  
  export default VTFAudioWorkletNode;