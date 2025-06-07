// src/content.js - Enhanced bridge with proper initialization handling
class VTFExtensionBridge {
  constructor() {
    // Initialization phases mirror inject script
    this.InitPhase = {
      PENDING: 'pending',
      SETTING_UP_AUDIO: 'setting_up_audio',
      CAPTURING: 'capturing',
      READY: 'ready'
    };
    
    this.state = {
      initialized: false,
      initPhase: this.InitPhase.PENDING,
      globalsFound: false,
      observerSetup: false,
      hooksApplied: false,
      capturing: false,
      ready: false,
      lastError: null,
      initStartTime: null,
      initProgress: null,
      stats: {
        messagesReceived: 0,
        messagesSent: 0,
        audioChunksRelayed: 0,
        errors: 0
      }
    };
    
    this.messageQueue = [];
    this.initPromise = null;
    this.lastInjectState = null;
    
    // Reconnection handling
    this.reconnectionState = {
      isReconnecting: false,
      attempts: 0,
      maxAttempts: 10,
      previousCaptures: []
    };
    
    // Message handler setup tracking
    this.handlersReady = false;
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
      
      // Notify UI of reconnection failure
      this.sendToBackground({
        type: 'reconnectionFailed',
        attempts: this.reconnectionState.attempts
      });
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
      if (!this.state.initialized || this.state.initPhase === this.InitPhase.FAILED) {
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
    this.state.initStartTime = Date.now();
    this.state.initPhase = this.InitPhase.PENDING;
    
    try {
      // Set up handlers FIRST before injecting script
      this.setupMessageHandlers();
      this.setupChromeHandlers();
      this.handlersReady = true;
      
      // Inject script
      await this.injectScript();
      
      // Wait for proper initialization
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
      this.state.initPhase = this.InitPhase.FAILED;
      console.error('[VTF Extension] Initialization failed:', error);
      
      // Notify UI of failure
      chrome.runtime.sendMessage({
        type: 'extensionInitFailed',
        error: error.message,
        phase: this.state.initPhase
      });
      
      throw error;
    }
  }
  
  injectScript() {
    return new Promise((resolve, reject) => {
      // Log injection context
      console.log('[VTF Extension] Injecting script...');
      console.log('[VTF Extension] Document readyState:', document.readyState);
      console.log('[VTF Extension] Current URL:', window.location.href);
      console.log('[VTF Extension] Has head:', !!document.head);
      console.log('[VTF Extension] Has documentElement:', !!document.documentElement);
      
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('inject/inject.js');
      
      // Add attributes to help with CSP
      script.setAttribute('data-vtf-inject', 'true');
      script.setAttribute('data-timestamp', Date.now().toString());
      
      script.onload = () => {
        console.log('[VTF Extension] Inject script loaded successfully');
        // Don't remove immediately - let it initialize
        setTimeout(() => script.remove(), 100);
        resolve();
      };
      
      script.onerror = (error) => {
        console.error('[VTF Extension] Failed to load inject script:', error);
        reject(new Error('Failed to load inject script'));
      };
      
      // Try multiple injection points for robustness
      const target = document.head || document.documentElement;
      if (target) {
        target.appendChild(script);
        console.log('[VTF Extension] Script injected into:', target.tagName);
      } else {
        console.error('[VTF Extension] No suitable injection target found!');
        reject(new Error('No injection target'));
      }
    });
  }
  
  waitForInitialization(timeout = null) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let checkCount = 0;
      
      const checkInitialized = () => {
        checkCount++;
        
        // Check for successful initialization
        if (this.state.initialized && this.state.initPhase === this.InitPhase.READY) {
          console.log(`[VTF Extension] Initialization succeeded after ${checkCount} checks`);
          resolve();
        } 
        // Check for failure - but only if inject script explicitly failed
        else if (this.state.initPhase === this.InitPhase.FAILED && this.state.lastError) {
          reject(new Error(this.state.lastError || 'Initialization failed'));
        }
        // No timeout by default - keep waiting forever
        else if (timeout && Date.now() - startTime > timeout) {
          reject(new Error(`Initialization timeout after ${timeout}ms in phase: ${this.state.initPhase}`));
        } 
        // Continue waiting - log progress periodically
        else {
          if (checkCount % 100 === 0) { // Every 10 seconds
            console.log(`[VTF Extension] Still waiting for initialization... (${checkCount * 0.1}s elapsed, phase: ${this.state.initPhase})`);
          }
          setTimeout(checkInitialized, 100);
        }
      };
      
      checkInitialized();
    });
  }
  
  setupMessageHandlers() {
    window.addEventListener('message', (event) => {
      // Handle VTF_AUDIO_DATA messages like the working prototype
      if (event.data && event.data.type === 'VTF_AUDIO_DATA') {
        if (this.state.capturing) {
          this.state.stats.audioChunksRelayed++;
          
          // Relay to background with proper format
          chrome.runtime.sendMessage({
            type: 'audioData',
            audioData: event.data.audioData,
            timestamp: event.data.timestamp,
            streamId: event.data.streamId,
            userId: event.data.userId,
            chunkNumber: this.state.stats.audioChunksRelayed,
            maxSample: event.data.maxSample,
            volume: event.data.volume
          }, response => {
            if (chrome.runtime.lastError) {
              console.error('[VTF Extension] Background message error:', chrome.runtime.lastError);
              this.state.stats.errors++;
            }
          });
        }
        return;
      }
      
      // Strict source checking for other messages
      if (event.data.source !== 'vtf-inject') return;
      
      this.state.stats.messagesReceived++;
      
      // Handle high-priority messages immediately
      if (event.data.priority === 'high') {
        console.log('[VTF Extension] High priority message:', event.data.type);
      }
      
      try {
        switch (event.data.type) {
          case 'initializationProgress':
            this.handleInitProgress(event.data.data);
            break;
            
          case 'initialized':
            this.handleInitialized(event.data.data);
            break;
            
          case 'initializationFailed':
            this.handleInitFailed(event.data.data);
            break;
            
          case 'globalsFound':
            this.state.globalsFound = event.data.data.hasGlobals;
            console.log('[VTF Extension] BONUS: Globals found!', event.data.data);
            
            // Globals are now optional - finding them is a bonus
            // Update UI to show enhanced features available
            chrome.runtime.sendMessage({
              type: 'globalsDiscovered',
              audioVolume: event.data.data.audioVolume,
              sessionState: event.data.data.sessionState,
              attempts: event.data.data.attempts
            });
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
            // Connection test already handled in checkConnection
            break;
            
          case 'activeCaptures':
            // Store active captures for reconnection handling
            if (event.data.data.activeCaptures) {
              this.reconnectionState.previousCaptures = event.data.data.activeCaptures;
            }
            break;
        }
      } catch (error) {
        console.error('[VTF Extension] Message handler error:', error);
        this.state.stats.errors++;
      }
    });
  }
  
  handleInitProgress(data) {
    this.state.initPhase = data.phase;
    this.state.initProgress = data.message;
    console.log(`[VTF Extension] Init progress: ${data.phase} - ${data.message}`);
    
    // Update specific state flags based on phase
    switch (data.phase) {
      case this.InitPhase.SETTING_UP_AUDIO:
        // Setting up audio monitoring
        break;
      case this.InitPhase.CAPTURING:
        // Started capturing audio
        break;
    }
    
    // Notify UI of progress
    chrome.runtime.sendMessage({
      type: 'initProgress',
      phase: data.phase,
      message: data.message
    });
  }
  
  handleInitialized(data) {
    this.state.initialized = true;
    this.state.initPhase = data.phase || this.InitPhase.READY;
    this.state.observerSetup = true;
    
    // Globals are now optional - not required for initialization
    this.state.globalsFound = data.globalsFound || false;
    this.state.hooksApplied = data.details?.hooksApplied || false;
    
    const initDuration = Date.now() - this.state.initStartTime;
    console.log(`[VTF Extension] Inject script initialized successfully in ${initDuration}ms`);
    console.log('[VTF Extension] AUDIO-FIRST initialization complete:', {
      audioElements: data.audioElements,
      capturedElements: data.capturedElements,
      globalsFound: data.globalsFound,
      details: data.details
    });
    
    // Store the details
    this.lastInjectState = data;
    
    // Update badge to show we're capturing
    chrome.runtime.sendMessage({ 
      type: 'updateBadge', 
      text: 'ON',
      color: '#4CAF50'
    });
  }
  
  handleInitFailed(data) {
    this.state.initPhase = this.InitPhase.FAILED;
    this.state.lastError = data.error;
    console.error('[VTF Extension] Initialization failed:', data);
    
    // Store errors for debugging
    if (data.errors) {
      data.errors.forEach(err => {
        this.handleError(err.type, err.error);
      });
    }
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
          activeCaptures: this.reconnectionState.previousCaptures || []
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
    if (data.phase) {
      this.state.initPhase = data.phase;
    }
    
    if (data.globalsFound !== undefined) {
      this.state.globalsFound = data.globalsFound;
    }
    
    if (data.observerSetup !== undefined) {
      this.state.observerSetup = data.observerSetup;
    }
    
    if (data.hooksApplied !== undefined) {
      this.state.hooksApplied = data.hooksApplied;
    }
    
    // Store full state for popup queries
    this.lastInjectState = data;
  }
  
  sendToInject(command, data = {}) {
    window.postMessage({
      source: 'vtf-content',
      type: command,
      data: data,
      timestamp: Date.now()
    }, '*');
  }
  
  isExtensionValid() {
    try {
      return chrome.runtime && chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }
  
  sendToBackground(message) {
    // Check if extension context is still valid
    if (!this.isExtensionValid()) {
      console.error('[VTF Extension] Extension context invalid, cannot send message');
      this.state.stats.errors++;
      return;
    }
    
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
        initPhase: this.state.initPhase,
        globalsFound: this.state.globalsFound,
        observerSetup: this.state.observerSetup,
        hooksApplied: this.state.hooksApplied,
        capturing: this.state.capturing,
        ready: this.state.ready,
        lastError: this.state.lastError,
        initProgress: this.state.initProgress,
        stats: this.state.stats,
        reconnecting: this.reconnectionState.isReconnecting
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