// src/inject/inject.js - Complete implementation with proper initialization flow
(function() {
  'use strict';
  
  // CRITICAL: Verify we're in the page context, not content script
  const contextCheck = {
    hasChrome: !!window.chrome,
    hasRuntime: !!(window.chrome && window.chrome.runtime),
    context: (window.chrome && window.chrome.runtime) ? 'CONTENT_SCRIPT' : 'PAGE'
  };
  
  console.log('[VTF Inject] Context verification:', contextCheck);
  console.log('[VTF Inject] Running in context:', contextCheck.context);
  console.log('[VTF Inject] Document readyState:', document.readyState);
  console.log('[VTF Inject] Window location:', window.location.href);
  
  // CRITICAL: If we're not in page context, abort!
  if (contextCheck.context !== 'PAGE') {
    console.error('[VTF Inject] FATAL: Not running in page context! Aborting.');
    return;
  }
  
  console.log('[VTF Inject] Starting initialization sequence');
  
  // Initialization State Machine
  const InitState = {
    PENDING: 'pending',
    SETTING_UP_AUDIO: 'setting_up_audio',
    CAPTURING: 'capturing',
    READY: 'ready'
  };
  
  // State management with detailed tracking
  const state = {
    phase: InitState.PENDING,
    initialized: false,
    globalsFound: false,
    observerSetup: false,
    hooksApplied: false,
    captureActive: false,
    errors: [],
    initStartTime: Date.now(),
    details: {
      globalsLocation: null,
      audioVolume: null,
      sessionState: null,
      observerTarget: null,
      appliedHooks: []
    }
  };
  
  // VTF Globals Finder with enhanced discovery
  const vtfGlobals = {
    globals: null,
    appService: null,
    mediaSoupService: null,
    lastError: null,
    discoveryAttempts: 0,
    
    find() {
      this.discoveryAttempts++;
      
      // Comprehensive logging for debugging
      if (this.discoveryAttempts === 1 || this.discoveryAttempts % 5 === 0) {
        console.log(`[VTF Inject] Globals discovery attempt #${this.discoveryAttempts}`);
        console.log('[VTF Inject] Checking window.E_:', typeof window.E_, window.E_);
        console.log('[VTF Inject] Checking E_ (direct):', typeof E_ !== 'undefined' ? E_ : 'undefined');
        console.log('[VTF Inject] Window keys (first 30):', Object.keys(window).slice(0, 30));
      }
      
      try {
        // Method 1: Direct access to known location
        if (window.E_) {
          console.log('[VTF Inject] window.E_ exists, validating...');
          console.log('[VTF Inject] E_.audioVolume:', window.E_.audioVolume);
          console.log('[VTF Inject] E_.sessData:', window.E_.sessData);
          
          // Validate it's fully initialized
          if (!window.E_.sessData) {
            console.log('[VTF Inject] E_ exists but sessData missing - not ready yet');
            return false;
          }
          
          this.globals = window.E_;
          state.details.globalsLocation = 'window.E_';
          console.log('[VTF Inject] ✓ Found and validated globals at window.E_');
          return true;
        }
        
        // Method 2: Try to access E_ directly (it might be a global variable not on window)
        try {
          if (typeof E_ !== 'undefined' && E_) {
            this.globals = E_;
            state.details.globalsLocation = 'E_ (global variable)';
            console.log('[VTF Inject] Found globals at E_ (global variable)');
            return true;
          }
        } catch (e) {
          // E_ doesn't exist
        }
        
        // Method 3: Look for window.Globals (capital G)
        if (window.Globals) {
          this.globals = window.Globals;
          state.details.globalsLocation = 'window.Globals';
          console.log('[VTF Inject] Found globals at window.Globals');
          return true;
        }
        
        // Method 4: Check for common VTF objects
        const vtfObjects = ['globals', 'Globals', 'vtfGlobals', 'appGlobals'];
        for (const objName of vtfObjects) {
          if (window[objName] && typeof window[objName] === 'object') {
            const obj = window[objName];
            if (obj.audioVolume !== undefined || obj.sessData !== undefined) {
              this.globals = obj;
              state.details.globalsLocation = `window.${objName}`;
              console.log(`[VTF Inject] Found globals at window.${objName}`);
              return true;
            }
          }
        }
        
        // Method 5: Scan for globals with validation
        for (const key in window) {
          try {
            if (key.length <= 3 && typeof window[key] === 'object' && window[key]) {
              const obj = window[key];
              // Enhanced validation
              if (obj.audioVolume !== undefined && 
                  obj.sessData !== undefined &&
                  (obj.sessData.currentState !== undefined || obj.sessData.state !== undefined)) {
                this.globals = obj;
                state.details.globalsLocation = `window.${key}`;
                console.log(`[VTF Inject] Found globals at window.${key}`);
                return true;
              }
            }
          } catch (e) {
            // Skip protected properties
          }
        }
        
        // Method 6: Check for VTF-specific services
        if (window.appService) {
          this.appService = window.appService;
          console.log('[VTF Inject] Found appService');
          
          // Try to find globals through appService
          if (this.appService.globals) {
            this.globals = this.appService.globals;
            state.details.globalsLocation = 'appService.globals';
            console.log('[VTF Inject] Found globals at appService.globals');
            return true;
          }
        }
        
        if (window.mediaSoupService) {
          this.mediaSoupService = window.mediaSoupService;
          console.log('[VTF Inject] Found mediaSoupService');
        }
        
        // Aggressive logging for debugging
        if (this.discoveryAttempts === 1 || this.discoveryAttempts % 5 === 0) {
          console.log(`[VTF Inject] Discovery attempt ${this.discoveryAttempts}: No globals found yet`);
          console.log('[VTF Inject] Checking for Angular:', typeof window.ng !== 'undefined');
          console.log('[VTF Inject] Checking for React:', typeof window.React !== 'undefined');
          console.log('[VTF Inject] Document ready state:', document.readyState);
          console.log('[VTF Inject] Body element exists:', !!document.body);
          console.log('[VTF Inject] topRoomDiv exists:', !!document.getElementById('topRoomDiv'));
          
          // Log all single-letter globals (common pattern)
          const singleLetterGlobals = Object.keys(window).filter(k => k.length === 1 || k.length === 2);
          console.log('[VTF Inject] Single/two-letter globals:', singleLetterGlobals);
          
          // Check for VTF-specific elements
          const vtfElements = {
            topRoomDiv: !!document.getElementById('topRoomDiv'),
            roomDiv: !!document.getElementById('roomDiv'),
            audioElements: document.querySelectorAll('audio').length,
            msRemAudioElements: document.querySelectorAll('audio[id^="msRemAudio-"]').length
          };
          console.log('[VTF Inject] VTF elements status:', vtfElements);
        }
        
        return false;
        
      } catch (error) {
        this.lastError = error;
        console.error('[VTF Inject] Error in globals discovery:', error);
        return false;
      }
    }
  };
  
  // Enhanced message sender with queuing
  const messageQueue = [];
  let messageHandlerReady = false;
  
  const sendMessage = (type, data, priority = 'normal') => {
    try {
      const message = {
        source: 'vtf-inject',
        type: type,
        data: data,
        timestamp: Date.now(),
        priority: priority,
        phase: state.phase
      };
      
      if (!messageHandlerReady && type !== 'initialized' && type !== 'initializationFailed') {
        messageQueue.push(message);
        return;
      }
      
      window.postMessage(message, '*');
      
      // Log high-priority messages
      if (priority === 'high') {
        console.log(`[VTF Inject] Sent ${type}:`, data);
      }
    } catch (error) {
      console.error('[VTF Inject] Failed to send message:', error);
      state.errors.push({ type: 'messageSend', error: error.message });
    }
  };
  
  // Flush queued messages
  const flushMessageQueue = () => {
    messageHandlerReady = true;
    while (messageQueue.length > 0) {
      const message = messageQueue.shift();
      window.postMessage(message, '*');
    }
  };
  
  // Function Hooks with comprehensive coverage
  const hookVTFFunctions = () => {
    const hooksApplied = [];
    
    // Hook reconnectAudio
    try {
      const targets = [
        { obj: window, name: 'reconnectAudio', path: 'window.reconnectAudio' },
        { obj: vtfGlobals.appService, name: 'reconnectAudio', path: 'appService.reconnectAudio' },
        { obj: vtfGlobals.mediaSoupService, name: 'reconnectAudio', path: 'mediaSoupService.reconnectAudio' }
      ];
      
      for (const target of targets) {
        if (target.obj && typeof target.obj[target.name] === 'function') {
          const original = target.obj[target.name];
          target.obj[target.name] = function(...args) {
            console.log('[VTF Inject] reconnectAudio called');
            sendMessage('vtfFunction', { 
              function: 'reconnectAudio',
              path: target.path,
              timestamp: Date.now() 
            }, 'high');
            return original.apply(this, args);
          };
          
          hooksApplied.push(target.path);
          break;
        }
      }
    } catch (error) {
      sendMessage('error', { 
        context: 'hookFunction',
        function: 'reconnectAudio',
        error: error.message 
      });
    }
    
    // Hook adjustVol
    try {
      if (typeof window.adjustVol === 'function') {
        const original = window.adjustVol;
        window.adjustVol = function(...args) {
          const result = original.apply(this, args);
          sendMessage('vtfFunction', { 
            function: 'adjustVol',
            volume: vtfGlobals.globals?.audioVolume,
            timestamp: Date.now() 
          });
          return result;
        };
        hooksApplied.push('window.adjustVol');
      }
    } catch (error) {
      sendMessage('error', { 
        context: 'hookFunction',
        function: 'adjustVol',
        error: error.message 
      });
    }
    
    state.details.appliedHooks = hooksApplied;
    console.log(`[VTF Inject] Applied ${hooksApplied.length} function hooks:`, hooksApplied);
    return hooksApplied;
  };
  
  // Enhanced Audio Capture with better error handling
  const audioCaptures = new Map();
  let captureErrors = 0;
  
  // Singleton AudioContext manager
  class AudioContextManager {
    static instance = null;
    static getContext() {
      if (!this.instance) {
        try {
          this.instance = new (window.AudioContext || window.webkitAudioContext)({ 
            sampleRate: 16000,
            latencyHint: 'interactive'
          });
          console.log('[VTF Inject] Created AudioContext with sampleRate:', this.instance.sampleRate);
        } catch (error) {
          console.error('[VTF Inject] Failed to create AudioContext:', error);
          throw error;
        }
      }
      return this.instance;
    }
    
    static async ensureRunning() {
      const ctx = this.getContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
        console.log('[VTF Inject] AudioContext resumed');
      }
      return ctx;
    }
  }
  
  const captureAudioElement = (element) => {
    // Generate userId from element ID or create one
    let userId;
    if (element.id) {
      userId = element.id.replace('msRemAudio-', '');
    } else {
      // Generate a unique ID for elements without IDs
      userId = `audio-${element.tagName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      element.setAttribute('data-vtf-capture-id', userId);
    }
    
    const streamId = userId; // Use same ID for both
    
    console.log(`[VTF Inject] Attempting to capture audio element:`, {
      id: element.id || 'no-id',
      generatedId: userId,
      hasSrcObject: !!element.srcObject,
      srcObjectType: element.srcObject?.constructor?.name,
      audioTracks: element.srcObject?.getAudioTracks?.()?.length || 0,
      readyState: element.readyState,
      paused: element.paused,
      muted: element.muted,
      volume: element.volume,
      className: element.className,
      dataset: element.dataset
    });
    
    try {
      // Monitor srcObject changes like the working prototype
      const originalDescriptor = Object.getOwnPropertyDescriptor(element, 'srcObject');
      Object.defineProperty(element, 'srcObject', {
        set: function(value) {
          console.log(`[VTF Inject] srcObject changed for ${streamId}`, value);
          this._srcObject = value;
          
          if (originalDescriptor && originalDescriptor.set) {
            originalDescriptor.set.call(this, value);
          }
          
          if (value instanceof MediaStream) {
            // Re-capture after stream change
            setTimeout(() => {
              if (audioCaptures.has(userId)) {
                cleanupCapture(userId);
              }
              captureAudioElement(element);
            }, 100);
          }
        },
        get: function() {
          return this._srcObject || (originalDescriptor && originalDescriptor.get ? originalDescriptor.get.call(this) : undefined);
        }
      });
      
      const stream = element.srcObject;
      
      if (!stream) {
        throw new Error('No srcObject on audio element');
      }
      
      if (audioCaptures.has(userId)) {
        console.log(`[VTF Inject] Already capturing ${userId}`);
        return;
      }
      
      // Validate stream
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks in stream');
      }
      
      // Use singleton AudioContext
      const audioContext = AudioContextManager.getContext();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      // Volume getter with fallback
      const getVolume = () => {
        try {
          return vtfGlobals.globals?.audioVolume || 1.0;
        } catch (e) {
          return 1.0;
        }
      };
      
      let chunkCount = 0;
      processor.onaudioprocess = (e) => {
        try {
          const inputData = e.inputBuffer.getChannelData(0);
          const maxSample = Math.max(...Array.from(inputData).map(Math.abs));
          
          if (maxSample < 0.001) return; // Skip silence
          
          // Apply volume
          const volume = getVolume();
          const scaledData = new Float32Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            scaledData[i] = inputData[i] * volume;
          }
          
          // Convert to Int16
          const int16Data = new Int16Array(scaledData.length);
          for (let i = 0; i < scaledData.length; i++) {
            const s = Math.max(-1, Math.min(1, scaledData[i]));
            int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          // Use the same message format as the working prototype
          window.postMessage({
            type: 'VTF_AUDIO_DATA',
            streamId: userId,
            userId: userId,
            audioData: Array.from(int16Data),
            timestamp: Date.now(),
            maxSample: maxSample,
            volume: volume,
            chunkIndex: chunkCount++
          }, '*');
        } catch (error) {
          console.error('[VTF Inject] Audio processing error:', error);
          sendMessage('error', {
            context: 'audioProcess',
            userId: userId,
            error: error.message
          });
        }
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      // Track ended handler
      audioTracks[0].onended = () => {
        console.log(`[VTF Inject] Track ended for ${userId}`);
        cleanupCapture(userId);
      };
      
      audioCaptures.set(userId, { 
        source, 
        processor, 
        audioContext,
        element,
        startTime: Date.now(),
        chunkCount: 0
      });
      
      sendMessage('captureStarted', { 
        userId,
        trackLabel: audioTracks[0].label 
      }, 'high');
      
      console.log(`[VTF Inject] Started capture for ${userId}`);
      
    } catch (error) {
      captureErrors++;
      console.error(`[VTF Inject] Failed to capture ${userId}:`, error);
      sendMessage('error', {
        context: 'captureStart',
        userId: userId,
        error: error.message,
        captureErrors: captureErrors
      }, 'high');
    }
  };
  
  const cleanupCapture = (userId) => {
    const capture = audioCaptures.get(userId);
    if (capture) {
      try {
        capture.source.disconnect();
        capture.processor.disconnect();
        // Don't close the shared AudioContext!
        
        audioCaptures.delete(userId);
        
        const duration = Date.now() - capture.startTime;
        sendMessage('captureStopped', { 
          userId,
          duration,
          chunks: capture.chunkCount 
        }, 'high');
        
        console.log(`[VTF Inject] Cleaned up capture for ${userId}`);
      } catch (error) {
        console.error(`[VTF Inject] Error cleaning up ${userId}:`, error);
      }
    }
  };
  
  // Removed old setupDOMObserver - DOM monitoring is now integrated into initialize()
  
  // Command Handler
  const handleCommand = (command, data) => {
    console.log('[VTF Inject] Received command:', command);
    
    switch (command) {
      case 'getState':
        sendMessage('state', {
          initialized: state.initialized,
          phase: state.phase,
          globalsFound: state.globalsFound,
          observerSetup: state.observerSetup,
          hooksApplied: state.hooksApplied,
          globals: !!vtfGlobals.globals,
          audioVolume: vtfGlobals.globals?.audioVolume,
          sessionState: vtfGlobals.globals?.sessData?.currentState,
          activeCaptures: Array.from(audioCaptures.keys()),
          captureErrors: captureErrors,
          errors: state.errors,
          details: state.details,
          initDuration: Date.now() - state.initStartTime
        });
        break;
        
      case 'getActiveCaptures':
        sendMessage('activeCaptures', {
          activeCaptures: Array.from(audioCaptures.keys())
        });
        break;
        
      case 'stopAllCaptures':
        const stopped = [];
        audioCaptures.forEach((capture, userId) => {
          cleanupCapture(userId);
          stopped.push(userId);
        });
        sendMessage('allCapturesStopped', { stopped });
        break;
        
      case 'refreshState':
        // Re-check globals and hooks
        const found = vtfGlobals.find();
        if (found && !state.globalsFound) {
          state.globalsFound = true;
          const hooks = hookVTFFunctions();
          state.hooksApplied = hooks.length > 0;
        }
        sendMessage('stateRefreshed', { 
          globalsFound: found,
          phase: state.phase,
          details: state.details
        });
        break;
        
      case 'connectionTest':
        // Respond immediately to connection test
        sendMessage('connectionTest', { 
          testId: data?.testId,
          connected: true,
          initialized: state.initialized,
          phase: state.phase
        });
        break;
        
      case 'resumeCapture':
        // Resume capture for a specific user
        if (data?.userId) {
          const element = document.getElementById(`msRemAudio-${data.userId}`);
          if (element && element.srcObject && !audioCaptures.has(data.userId)) {
            captureAudioElement(element);
            sendMessage('captureResumed', { userId: data.userId });
          } else {
            sendMessage('captureResumeFailed', { 
              userId: data.userId,
              reason: !element ? 'Element not found' : 
                      !element.srcObject ? 'No stream' : 
                      'Already capturing'
            });
          }
        }
        break;
    }
  };
  
  // Main initialization - AUDIO FIRST, globals optional
  const initialize = () => {
    console.log('[VTF Inject] Starting AUDIO-FIRST initialization');
    state.phase = InitState.PENDING;
    
    // Phase 1: IMMEDIATELY start monitoring for audio elements
    state.phase = InitState.SETTING_UP_AUDIO;
    sendMessage('initializationProgress', { 
      phase: state.phase,
      message: 'Setting up audio monitoring...'
    }, 'high');
    
    // Process existing audio elements RIGHT AWAY
    const processAudioElements = () => {
      const allAudioElements = document.querySelectorAll('audio');
      const msRemAudioElements = document.querySelectorAll('audio[id^="msRemAudio-"]');
      
      console.log(`[VTF Inject] Audio scan: ${allAudioElements.length} total, ${msRemAudioElements.length} msRemAudio`);
      
      let capturedCount = 0;
      
      // Capture from any audio element with the right pattern
      allAudioElements.forEach(element => {
        // Check various patterns that might indicate user audio
        if (element.id?.includes('msRemAudio') || 
            element.id?.includes('userAudio') ||
            element.className?.includes('remote-audio') ||
            element.dataset?.userId) {
          
          const userId = element.id || `audio-${Date.now()}-${Math.random()}`;
          
          // Try to capture if it has a stream
          if (element.srcObject && !audioCaptures.has(userId)) {
            captureAudioElement(element);
            capturedCount++;
          } else if (!element.srcObject) {
            // Set up monitoring for when stream appears
            console.log(`[VTF Inject] Audio element ${userId} has no stream yet, monitoring...`);
            monitorAudioElement(element);
          }
        }
      });
      
      return { total: allAudioElements.length, captured: capturedCount };
    };
    
    // Monitor individual audio element for stream
    const monitorAudioElement = (element) => {
      const checkInterval = setInterval(() => {
        if (element.srcObject) {
          clearInterval(checkInterval);
          captureAudioElement(element);
        }
      }, 100);
      
      // Clean up after 30 seconds if no stream
      setTimeout(() => clearInterval(checkInterval), 30000);
    };
    
    // Set up DOM observer for NEW audio elements
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeName === 'AUDIO' || node.querySelector?.('audio')) {
            console.log('[VTF Inject] New audio element detected');
            processAudioElements();
          }
        });
      });
    });
    
    // Start observing immediately
    const observerTarget = document.body || document.documentElement;
    observer.observe(observerTarget, { 
      childList: true, 
      subtree: true,
      attributes: false
    });
    
    state.observerSetup = true;
    console.log('[VTF Inject] DOM observer active, watching for audio elements');
    
    // Initial audio scan
    const initialScan = processAudioElements();
    console.log(`[VTF Inject] Initial scan complete: ${initialScan.captured} audio elements captured`);
    
    // Keep scanning periodically for dynamic elements
    setInterval(() => {
      const scan = processAudioElements();
      if (scan.captured > 0) {
        console.log(`[VTF Inject] Periodic scan: ${scan.captured} new captures`);
      }
    }, 3000);
    
    // Mark as ready - we're capturing audio!
    state.phase = InitState.READY;
    state.initialized = true;
    state.details.observerTarget = observerTarget.tagName;
    
    sendMessage('initialized', {
      success: true,
      phase: state.phase,
      timestamp: Date.now(),
      duration: Date.now() - state.initStartTime,
      audioElements: initialScan.total,
      capturedElements: initialScan.captured,
      globalsFound: false, // Not required!
      details: state.details
    }, 'high');
    
    // Phase 2: OPTIONAL - Try to find globals in the background
    console.log('[VTF Inject] Starting OPTIONAL globals discovery in background...');
    startBackgroundGlobalsDiscovery();
    
    // Flush any queued messages
    flushMessageQueue();
  };
  
  // Background task to find globals - NON-BLOCKING
  const startBackgroundGlobalsDiscovery = () => {
    let attempts = 0;
    
    const tryFindGlobals = () => {
      attempts++;
      
      if (vtfGlobals.find()) {
        console.log(`[VTF Inject] BONUS: Found globals after ${attempts} attempts!`);
        state.globalsFound = true;
        state.details.audioVolume = vtfGlobals.globals?.audioVolume;
        state.details.sessionState = vtfGlobals.globals?.sessData?.currentState;
        
        // Apply hooks if we can
        const hooks = hookVTFFunctions();
        state.hooksApplied = hooks.length > 0;
        
        // Watch for replacement
        watchGlobals();
        
        // Notify that we found globals
        sendMessage('globalsFound', { 
          hasGlobals: true,
          location: state.details.globalsLocation,
          audioVolume: vtfGlobals.globals?.audioVolume,
          sessionState: vtfGlobals.globals?.sessData?.currentState,
          attempts: attempts
        }, 'high');
        
        return; // Stop searching
      }
      
      // Log periodically but don't spam
      if (attempts % 20 === 0) {
        console.log(`[VTF Inject] Still searching for globals (attempt ${attempts}) - extension works without them!`);
      }
      
      // Keep trying forever, but slow down over time
      const delay = Math.min(500 * Math.ceil(attempts / 10), 5000);
      setTimeout(tryFindGlobals, delay);
    };
    
    // Start after a small delay
    setTimeout(tryFindGlobals, 1000);
  };
  
  // Removed old discoverGlobals - globals are now optional!
  
  // Listen for commands from content script
  window.addEventListener('message', (event) => {
    if (event.data.source !== 'vtf-content') return;
    
    try {
      handleCommand(event.data.type, event.data);
    } catch (error) {
      console.error('[VTF Inject] Command handler error:', error);
      sendMessage('error', {
        context: 'commandHandler',
        command: event.data.type,
        error: error.message
      });
    }
  });
  
  // Watch for globals being replaced/moved
  const watchGlobals = () => {
    if (!vtfGlobals.globals) return;
    
    const location = state.details.globalsLocation;
    if (!location) return;
    
    // Use Object.defineProperty to detect if globals are replaced
    if (location === 'window.E_') {
      const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'E_');
      Object.defineProperty(window, 'E_', {
        configurable: true,
        enumerable: true,
        get() {
          return this._E_;
        },
        set(value) {
          console.log('[VTF Inject] WARNING: window.E_ is being replaced!', value);
          this._E_ = value;
          vtfGlobals.globals = value;
          
          // Re-apply hooks if globals were replaced
          if (value && state.initialized) {
            console.log('[VTF Inject] Re-applying hooks after globals replacement');
            hookVTFFunctions();
          }
        }
      });
      
      // Set initial value
      window._E_ = vtfGlobals.globals;
    }
  };
  
  // Listen for SPA navigation events
  const handleSPANavigation = () => {
    console.log('[VTF Inject] SPA navigation detected, re-checking state');
    
    // Re-check globals
    if (!vtfGlobals.globals || !vtfGlobals.find()) {
      console.log('[VTF Inject] Globals lost after navigation, re-initializing...');
      state.initialized = false;
      state.globalsFound = false;
      initialize();
    } else {
      // Re-process audio elements
      const processExistingAudioElements = () => {
        const existingElements = document.querySelectorAll('audio[id^="msRemAudio-"]');
        console.log(`[VTF Inject] Re-checking ${existingElements.length} audio elements after navigation`);
        
        existingElements.forEach(element => {
          if (element.srcObject && !audioCaptures.has(element.id.replace('msRemAudio-', ''))) {
            captureAudioElement(element);
          }
        });
      };
      
      processExistingAudioElements();
    }
  };
  
  // Listen for navigation events
  window.addEventListener('popstate', handleSPANavigation);
  window.addEventListener('hashchange', handleSPANavigation);
  
  // Listen for custom VTF events
  const customEvents = ['VTFReady', 'vtfReady', 'appReady', 'roomReady'];
  customEvents.forEach(eventName => {
    window.addEventListener(eventName, (event) => {
      console.log(`[VTF Inject] Custom event received: ${eventName}`, event);
      
      // Re-check initialization
      if (!state.initialized) {
        console.log('[VTF Inject] Re-initializing after custom event');
        initialize();
      }
    });
  });
  
  // Watch for URL changes without page reload (SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log('[VTF Inject] URL changed to:', url);
      handleSPANavigation();
    }
  }).observe(document, { subtree: true, childList: true });
  
  // Start initialization immediately - our stubborn polling handles timing
  console.log('[VTF Inject] Document readyState:', document.readyState);
  console.log('[VTF Inject] Starting stubborn initialization...');
  initialize();
  
  // Expose state for debugging
  window.__vtfInjectState = state;
  window.__vtfInjectCaptures = audioCaptures;
  window.__vtfInjectGlobals = vtfGlobals;
  window.__vtfInjectVersion = '0.8.0';
})();