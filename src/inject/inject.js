// src/inject/inject.js - Complete implementation with proper initialization flow
(function() {
  'use strict';
  
  console.log('[VTF Inject] Starting initialization sequence');
  
  // Initialization State Machine
  const InitState = {
    PENDING: 'pending',
    DISCOVERING_GLOBALS: 'discovering_globals',
    SETTING_UP_OBSERVERS: 'setting_up_observers',
    APPLYING_HOOKS: 'applying_hooks',
    READY: 'ready',
    FAILED: 'failed'
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
      
      try {
        // Method 1: Direct access to known location
        if (window.E_) {
          this.globals = window.E_;
          state.details.globalsLocation = 'window.E_';
          console.log('[VTF Inject] Found globals at window.E_');
          return true;
        }
        
        // Method 2: Scan for globals with validation
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
        
        // Method 3: Check for VTF-specific services
        if (window.appService) {
          this.appService = window.appService;
          console.log('[VTF Inject] Found appService');
        }
        
        if (window.mediaSoupService) {
          this.mediaSoupService = window.mediaSoupService;
          console.log('[VTF Inject] Found mediaSoupService');
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
    const userId = element.id.replace('msRemAudio-', '');
    
    try {
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
          
          sendMessage('audioData', {
            userId: userId,
            samples: Array.from(int16Data),
            timestamp: Date.now(),
            volume: volume,
            chunkIndex: chunkCount++
          });
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
  
  // Enhanced DOM Monitoring with retry logic
  let observerRetries = 0;
  const MAX_OBSERVER_RETRIES = 5;
  
  const setupDOMObserver = async () => {
    return new Promise((resolve) => {
      const attemptSetup = () => {
        try {
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              mutation.addedNodes.forEach((node) => {
                if (node.nodeName === 'AUDIO' && node.id?.startsWith('msRemAudio-')) {
                  console.log(`[VTF Inject] New audio element: ${node.id}`);
                  
                  // Stream detection with timeout
                  let attempts = 0;
                  const maxAttempts = 100; // 5 seconds
                  
                  const checkStream = setInterval(() => {
                    attempts++;
                    
                    if (node.srcObject) {
                      clearInterval(checkStream);
                      captureAudioElement(node);
                    } else if (attempts >= maxAttempts) {
                      clearInterval(checkStream);
                      sendMessage('error', {
                        context: 'streamDetection',
                        userId: node.id.replace('msRemAudio-', ''),
                        error: 'Stream detection timeout after 5 seconds'
                      });
                    }
                  }, 50);
                }
              });
              
              mutation.removedNodes.forEach((node) => {
                if (node.nodeName === 'AUDIO' && node.id?.startsWith('msRemAudio-')) {
                  const userId = node.id.replace('msRemAudio-', '');
                  console.log(`[VTF Inject] Audio element removed: ${userId}`);
                  cleanupCapture(userId);
                }
              });
            });
          });
          
          // Find target with fallback
          const target = document.getElementById('topRoomDiv') || document.body;
          observer.observe(target, { 
            childList: true, 
            subtree: true,
            attributes: false
          });
          
          state.details.observerTarget = target.id || 'body';
          console.log(`[VTF Inject] DOM observer started on ${state.details.observerTarget}`);
          resolve(true);
          
        } catch (error) {
          observerRetries++;
          console.error('[VTF Inject] Failed to setup observer:', error);
          
          if (observerRetries < MAX_OBSERVER_RETRIES) {
            setTimeout(() => attemptSetup(), 1000 * observerRetries);
          } else {
            state.errors.push({
              type: 'observer',
              error: 'Failed to setup DOM observer after retries'
            });
            resolve(false);
          }
        }
      };
      
      attemptSetup();
    });
  };
  
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
  
  // Main initialization sequence with proper async coordination
  const initialize = async () => {
    console.log('[VTF Inject] Starting initialization sequence');
    state.phase = InitState.PENDING;
    
    try {
      // Phase 1: Discover globals
      state.phase = InitState.DISCOVERING_GLOBALS;
      sendMessage('initializationProgress', { 
        phase: state.phase,
        message: 'Discovering VTF globals...'
      }, 'high');
      
      const globalsFound = await discoverGlobals();
      
      if (!globalsFound) {
        throw new Error('VTF globals not found after timeout');
      }
      
      state.globalsFound = true;
      state.details.audioVolume = vtfGlobals.globals?.audioVolume;
      state.details.sessionState = vtfGlobals.globals?.sessData?.currentState;
      
      // Phase 2: Setup DOM observer
      state.phase = InitState.SETTING_UP_OBSERVERS;
      sendMessage('initializationProgress', { 
        phase: state.phase,
        message: 'Setting up DOM observers...'
      }, 'high');
      
      const observerReady = await setupDOMObserver();
      
      if (!observerReady) {
        throw new Error('Failed to setup DOM observer');
      }
      
      state.observerSetup = true;
      
      // Phase 3: Apply hooks
      state.phase = InitState.APPLYING_HOOKS;
      sendMessage('initializationProgress', { 
        phase: state.phase,
        message: 'Applying function hooks...'
      }, 'high');
      
      const hooks = hookVTFFunctions();
      state.hooksApplied = hooks.length > 0;
      
      // Phase 4: Process existing elements
      const existingElements = document.querySelectorAll('audio[id^="msRemAudio-"]');
      console.log(`[VTF Inject] Found ${existingElements.length} existing audio elements`);
      
      existingElements.forEach(element => {
        if (element.srcObject) {
          captureAudioElement(element);
        }
      });
      
      // Phase 5: Mark as ready
      state.phase = InitState.READY;
      state.initialized = true;
      
      const initDuration = Date.now() - state.initStartTime;
      console.log(`[VTF Inject] Initialization complete in ${initDuration}ms`);
      
      // Send success message
      sendMessage('initialized', {
        success: true,
        phase: state.phase,
        timestamp: Date.now(),
        duration: initDuration,
        captureErrors: captureErrors,
        errors: state.errors,
        details: state.details
      }, 'high');
      
      // Flush any queued messages
      flushMessageQueue();
      
    } catch (error) {
      state.phase = InitState.FAILED;
      state.errors.push({
        type: 'initialization',
        error: error.message,
        phase: state.phase
      });
      
      console.error('[VTF Inject] Initialization failed:', error);
      
      sendMessage('initializationFailed', {
        phase: state.phase,
        error: error.message,
        errors: state.errors,
        duration: Date.now() - state.initStartTime
      }, 'high');
    }
  };
  
  // Async globals discovery with timeout
  const discoverGlobals = () => {
    return new Promise((resolve) => {
      const maxAttempts = 60; // 30 seconds
      let attempts = 0;
      
      const tryDiscover = () => {
        attempts++;
        
        if (vtfGlobals.find()) {
          sendMessage('globalsFound', { 
            hasGlobals: true,
            location: state.details.globalsLocation,
            audioVolume: vtfGlobals.globals?.audioVolume,
            sessionState: vtfGlobals.globals?.sessData?.currentState,
            attempts: attempts
          }, 'high');
          resolve(true);
        } else if (attempts >= maxAttempts) {
          state.errors.push({ 
            type: 'globalsDiscovery', 
            error: `Timeout after ${attempts} attempts (${attempts * 0.5}s)`,
            lastError: vtfGlobals.lastError?.message
          });
          sendMessage('globalsFound', { 
            hasGlobals: false,
            error: vtfGlobals.lastError?.message || 'Not found after timeout',
            attempts: attempts
          }, 'high');
          resolve(false);
        } else {
          setTimeout(tryDiscover, 500);
        }
      };
      
      tryDiscover();
    });
  };
  
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
  
  // Start initialization
  initialize();
  
  // Expose state for debugging
  window.__vtfInjectState = state;
  window.__vtfInjectCaptures = audioCaptures;
  window.__vtfInjectGlobals = vtfGlobals;
})();