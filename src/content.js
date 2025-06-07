// src/content.js - Enhanced bridge with state management
class VTFExtensionBridge {
  constructor() {
    this.state = {
      initialized: false,
      globalsFound: false,
      capturing: false,
      ready: false,
      lastError: null,
      stats: {
        messagesReceived: 0,
        messagesSent: 0,
        audioChunksRelayed: 0,
        errors: 0
      }
    };
    
    this.messageQueue = [];
    this.initPromise = null;
    
    // Simple reconnection state
    this.reconnectionState = {
      isReconnecting: false,
      attempts: 0,
      maxAttempts: 10,
      previousCaptures: []
    };
  }
  
  // Simple reconnection handling
  handleDisconnect(activeCaptures = []) {
    console.log('[VTF Extension] Handling disconnect');
    
    this.reconnectionState.isReconnecting = true;
    this.reconnectionState.previousCaptures = activeCaptures;
    this.reconnectionState.attempts = 0;
    
    // Notify background
    this.sendToBackground({
      type: 'disconnected',
      previousCaptures: activeCaptures
    });
    
    // Start reconnection attempts
    this.attemptReconnection();
  }
  
  async attemptReconnection() {
    if (this.reconnectionState.attempts >= this.reconnectionState.maxAttempts) {
      console.error('[VTF Extension] Max reconnection attempts reached');
      this.reconnectionState.isReconnecting = false;
      return;
    }
    
    this.reconnectionState.attempts++;
    console.log(`[VTF Extension] Reconnection attempt ${this.reconnectionState.attempts}`);
    
    // Check if inject script is responsive
    const connected = await this.checkConnection();
    
    if (connected) {
      console.log('[VTF Extension] Reconnected successfully');
      this.reconnectionState.isReconnecting = false;
      
      // Notify background
      this.sendToBackground({
        type: 'reconnected',
        attempts: this.reconnectionState.attempts,
        previousCaptures: this.reconnectionState.previousCaptures
      });
      
      // Re-initialize if needed
      if (!this.state.initialized) {
        await this.init();
      }
    } else {
      // Retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, this.reconnectionState.attempts - 1), 10000);
      setTimeout(() => this.attemptReconnection(), delay);
    }
  }
  
  async checkConnection() {
    return new Promise((resolve) => {
      const testId = `test-${Date.now()}`;
      let responded = false;
      
      const handleResponse = (event) => {
        if (event.data.source === 'vtf-inject' && 
            event.data.type === 'connectionTest' &&
            event.data.data?.testId === testId) {
          responded = true;
          window.removeEventListener('message', handleResponse);
          resolve(true);
        }
      };
      
      window.addEventListener('message', handleResponse);
      this.sendToInject('connectionTest', { testId });
      
      // Timeout after 2 seconds
      setTimeout(() => {
        window.removeEventListener('message', handleResponse);
        if (!responded) resolve(false);
      }, 2000);
    });
  }
  
  async init() {
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = this._init();
    return this.initPromise;
  }
  
  async _init() {
    console.log('[VTF Extension] Initializing bridge...');
    
    try {
      // Set up handlers first
      this.setupMessageHandlers();
      this.setupChromeHandlers();
      
      // Then inject script
      await this.injectScript();
      
      // Wait for initialization
      await this.waitForInitialization();
      
      this.state.ready = true;
      console.log('[VTF Extension] Bridge ready');
      
      // Notify popup/background
      chrome.runtime.sendMessage({
        type: 'extensionReady',
        state: this.getState()
      });
      
    } catch (error) {
      this.state.lastError = error.message;
      console.error('[VTF Extension] Initialization failed:', error);
      throw error;
    }
  }
  
  injectScript() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('inject/inject.js');
      
      script.onload = () => {
        script.remove();
        console.log('[VTF Extension] Inject script loaded');
        resolve();
      };
      
      script.onerror = () => {
        reject(new Error('Failed to load inject script'));
      };
      
      (document.head || document.documentElement).appendChild(script);
    });
  }
  
  waitForInitialization(timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkInitialized = () => {
        if (this.state.initialized) {
          resolve();
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Initialization timeout'));
        } else {
          setTimeout(checkInitialized, 100);
        }
      };
      
      checkInitialized();
    });
  }
  
  setupMessageHandlers() {
    window.addEventListener('message', (event) => {
      // Strict source checking
      if (event.data.source !== 'vtf-inject') return;
      
      this.state.stats.messagesReceived++;
      
      // Handle high-priority messages immediately
      if (event.data.priority === 'high') {
        console.log('[VTF Extension] High priority message:', event.data.type);
      }
      
      try {
        switch (event.data.type) {
          case 'initialized':
            this.state.initialized = true;
            console.log('[VTF Extension] Inject script initialized');
            break;
            
          case 'globalsFound':
            this.state.globalsFound = event.data.data.hasGlobals;
            console.log('[VTF Extension] Globals found:', event.data.data.hasGlobals);
            
            if (!event.data.data.hasGlobals && event.data.data.error) {
              this.handleError('globalsDiscovery', event.data.data.error);
            }
            break;
            
          case 'audioData':
            if (this.state.capturing) {
              this.state.stats.audioChunksRelayed++;
              
              // Relay to background
              this.sendToBackground({
                type: 'audioChunk',
                userId: event.data.data.userId,
                chunk: event.data.data.samples,
                timestamp: event.data.data.timestamp,
                sampleRate: 16000
              });
            }
            break;
            
          case 'captureStarted':
            console.log('[VTF Extension] Capture started for', event.data.data.userId);
            this.sendToBackground({
              type: 'userJoined',
              userId: event.data.data.userId,
              timestamp: event.data.data.timestamp
            });
            break;
            
          case 'captureStopped':
            console.log('[VTF Extension] Capture stopped for', event.data.data.userId);
            this.sendToBackground({
              type: 'userLeft',
              userId: event.data.data.userId,
              duration: event.data.data.duration,
              chunks: event.data.data.chunks
            });
            break;
            
          case 'vtfFunction':
            this.handleVTFFunction(event.data.data);
            break;
            
          case 'error':
            this.handleError(event.data.data.context, event.data.data.error);
            break;
            
          case 'state':
            // Response to getState command
            this.handleStateResponse(event.data.data);
            break;
            
          case 'connectionTest':
            // Respond to connection test from reconnection handler
            this.sendToInject('connectionTestResponse', { testId: event.data.data.testId });
            break;
        }
      } catch (error) {
        console.error('[VTF Extension] Message handler error:', error);
        this.state.stats.errors++;
      }
    });
  }
  
  setupChromeHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // Async handler
      (async () => {
        try {
          switch (request.type) {
            case 'startCapture':
              this.state.capturing = true;
              console.log('[VTF Extension] Starting capture');
              sendResponse({ status: 'started' });
              break;
              
            case 'stopCapture':
              this.state.capturing = false;
              this.sendToInject('stopAllCaptures');
              console.log('[VTF Extension] Stopping capture');
              sendResponse({ status: 'stopped' });
              break;
              
            case 'getStatus':
              // Request fresh state from inject
              this.sendToInject('getState');
              sendResponse(this.getState());
              break;
              
            case 'refreshState':
              this.sendToInject('refreshState');
              sendResponse({ status: 'refreshing' });
              break;
              
            default:
              sendResponse({ error: 'Unknown command' });
          }
        } catch (error) {
          console.error('[VTF Extension] Chrome handler error:', error);
          sendResponse({ error: error.message });
        }
      })();
      
      return true; // Async response
    });
  }
  
  handleVTFFunction(data) {
    console.log('[VTF Extension] VTF function called:', data.function);
    
    // Handle reconnectAudio specifically
    if (data.function === 'reconnectAudio') {
      console.log('[VTF Extension] Audio reconnection detected');
      
      // Get current active captures before disconnect
      this.sendToInject('getActiveCaptures');
      
      // Wait a bit for response then trigger reconnection
      setTimeout(() => {
        const captureState = {
          activeCaptures: this.lastInjectState?.activeCaptures || []
        };
        this.handleDisconnect(captureState.activeCaptures);
      }, 100);
    }
    
    // Forward to background for logging
    this.sendToBackground({
      type: 'vtfFunction',
      function: data.function,
      timestamp: data.timestamp
    });
  }
  
  handleError(context, error) {
    console.error(`[VTF Extension] Error in ${context}:`, error);
    this.state.stats.errors++;
    this.state.lastError = { context, error, timestamp: Date.now() };
    
    // Notify background
    this.sendToBackground({
      type: 'extensionError',
      context,
      error,
      timestamp: Date.now()
    });
  }
  
  handleStateResponse(data) {
    // Update our state with inject script state
    if (data.globalsFound !== undefined) {
      this.state.globalsFound = data.globalsFound;
    }
    
    // Store for popup queries
    this.lastInjectState = data;
  }
  
  sendToInject(command) {
    window.postMessage({
      source: 'vtf-content',
      type: command,
      timestamp: Date.now()
    }, '*');
  }
  
  sendToBackground(message) {
    this.state.stats.messagesSent++;
    
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        console.error('[VTF Extension] Background message error:', 
          chrome.runtime.lastError);
        this.state.stats.errors++;
      }
    });
  }
  
  getState() {
    return {
      bridge: {
        initialized: this.state.initialized,
        globalsFound: this.state.globalsFound,
        capturing: this.state.capturing,
        ready: this.state.ready,
        lastError: this.state.lastError,
        stats: this.state.stats
      },
      inject: this.lastInjectState || {}
    };
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.vtfBridge = new VTFExtensionBridge();
    window.vtfBridge.init().catch(console.error);
  });
} else {
  window.vtfBridge = new VTFExtensionBridge();
  window.vtfBridge.init().catch(console.error);
}