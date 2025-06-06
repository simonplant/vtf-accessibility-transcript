/**
 * VTFAudioWorkletNode - Main thread controller for VTF audio processing
 * 
 * This class provides an easy-to-use interface for the AudioWorklet processor.
 * It handles worklet loading, node creation, and message passing between
 * the audio thread and main thread.
 * 
 * @module vtf-audio-worklet-node
 */

export class VTFAudioWorkletNode {
    constructor(context, userId, options = {}) {
      // Validate inputs
      if (!context || !(context instanceof AudioContext)) {
        throw new Error('[Audio Worklet] Invalid AudioContext provided');
      }
      
      if (!userId || typeof userId !== 'string') {
        throw new Error('[Audio Worklet] Invalid userId provided');
      }
      
      // Store configuration
      this.context = context;
      this.userId = userId;
      this.options = {
        bufferSize: 4096,
        silenceThreshold: 0.001,
        workletPath: 'audio-worklet.js',
        ...options
      };
      
      // State
      this.isInitialized = false;
      this.node = null;
      this.audioDataCallback = null;
      this.statsCallback = null;
      
      // Statistics
      this.stats = {
        initialized: false,
        messagesReceived: 0,
        audioChunksReceived: 0,
        lastMessageTime: null,
        initTime: null
      };
      
      // Error state
      this.lastError = null;
    }
    
    /**
     * Initialize the worklet and create the processing node
     * @returns {Promise<void>}
     */
    async initialize() {
      if (this.isInitialized) {
        console.warn('[Audio Worklet] Already initialized');
        return;
      }
      
      console.log(`[Audio Worklet] Initializing for user: ${this.userId}`);
      
      try {
        // Check if AudioWorklet is supported
        if (!this.context.audioWorklet) {
          throw new Error('AudioWorklet not supported in this browser');
        }
        
        // Construct worklet URL
        let workletUrl = this.options.workletPath;
        
        // If in Chrome extension context, use chrome.runtime.getURL
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
          workletUrl = chrome.runtime.getURL(`workers/${this.options.workletPath}`);
        }
        
        console.log('[Audio Worklet] Loading worklet from:', workletUrl);
        
        // Load the worklet module
        await this.context.audioWorklet.addModule(workletUrl);
        
        console.log('[Audio Worklet] Worklet module loaded successfully');
        
        // Create the worklet node
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
        
        // Set up message handling
        this.node.port.onmessage = (event) => {
          this.handleWorkletMessage(event.data);
        };
        
        // Mark as initialized
        this.isInitialized = true;
        this.stats.initTime = Date.now();
        
        console.log(`[Audio Worklet] Initialized successfully for user: ${this.userId}`);
        
      } catch (error) {
        this.lastError = error;
        console.error('[Audio Worklet] Initialization failed:', error);
        throw error;
      }
    }
    
    /**
     * Connect the worklet node to an audio destination
     * @param {AudioNode} destination - The node to connect to
     */
    connect(destination) {
      if (!this.isInitialized || !this.node) {
        throw new Error('[Audio Worklet] Not initialized');
      }
      
      this.node.connect(destination);
      console.log('[Audio Worklet] Connected to audio graph');
    }
    
    /**
     * Disconnect the worklet node
     */
    disconnect() {
      if (!this.node) {
        return;
      }
      
      try {
        this.node.disconnect();
        console.log('[Audio Worklet] Disconnected from audio graph');
      } catch (error) {
        // Node might already be disconnected
        console.warn('[Audio Worklet] Disconnect warning:', error.message);
      }
    }
    
    /**
     * Set callback for audio data chunks
     * @param {Function} callback - Function to call with audio data
     */
    onAudioData(callback) {
      if (typeof callback !== 'function') {
        throw new Error('[Audio Worklet] Callback must be a function');
      }
      
      this.audioDataCallback = callback;
    }
    
    /**
     * Set callback for statistics updates
     * @param {Function} callback - Function to call with stats
     */
    onStats(callback) {
      if (typeof callback !== 'function') {
        throw new Error('[Audio Worklet] Callback must be a function');
      }
      
      this.statsCallback = callback;
    }
    
    /**
     * Request statistics from the worklet
     * @returns {Promise<Object>} - Statistics from the processor
     */
    async getStats() {
      if (!this.isInitialized || !this.node) {
        return this.stats;
      }
      
      return new Promise((resolve) => {
        // Set up one-time listener for stats
        const originalCallback = this.statsCallback;
        this.statsCallback = (stats) => {
          this.statsCallback = originalCallback;
          resolve({
            ...this.stats,
            processor: stats
          });
        };
        
        // Request stats
        this.node.port.postMessage({ command: 'getStats' });
        
        // Timeout after 1 second
        setTimeout(() => {
          this.statsCallback = originalCallback;
          resolve(this.stats);
        }, 1000);
      });
    }
    
    /**
     * Update processor configuration
     * @param {Object} config - New configuration values
     */
    updateConfig(config) {
      if (!this.isInitialized || !this.node) {
        throw new Error('[Audio Worklet] Not initialized');
      }
      
      this.node.port.postMessage({
        command: 'updateConfig',
        config: config
      });
      
      // Update local config
      Object.assign(this.options, config);
    }
    
    /**
     * Force flush any buffered audio
     */
    flush() {
      if (!this.isInitialized || !this.node) {
        return;
      }
      
      this.node.port.postMessage({ command: 'flush' });
    }
    
    /**
     * Handle messages from the worklet
     * @private
     */
    handleWorkletMessage(data) {
      this.stats.messagesReceived++;
      this.stats.lastMessageTime = Date.now();
      
      switch (data.type) {
        case 'initialized':
          this.stats.initialized = true;
          console.log(`[Audio Worklet] Processor initialized for ${data.userId}`);
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
          console.warn(`[Audio Worklet] Unknown message type: ${data.type}`);
      }
    }
    
    /**
     * Get debug information
     * @returns {Object} - Debug state
     */
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
    
    /**
     * Destroy the worklet node and clean up resources
     */
    destroy() {
      console.log(`[Audio Worklet] Destroying node for user: ${this.userId}`);
      
      // Stop the processor
      if (this.node) {
        this.node.port.postMessage({ command: 'stop' });
        
        // Disconnect
        this.disconnect();
        
        // Clear reference
        this.node = null;
      }
      
      // Clear callbacks
      this.audioDataCallback = null;
      this.statsCallback = null;
      
      // Mark as not initialized
      this.isInitialized = false;
      
      console.log('[Audio Worklet] Destroyed successfully');
    }
  }
  
  // Export as default as well
  export default VTFAudioWorkletNode;