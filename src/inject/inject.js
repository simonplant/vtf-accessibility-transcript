// src/inject/inject.js - Complete implementation with error handling
(function() {
  'use strict';
  
  console.log('[VTF Inject] Initializing in page context');
  
  // State management
  const state = {
    initialized: false,
    globalsFound: false,
    captureActive: false,
    errors: []
  };
  
  // VTF Globals Finder with error handling
  const vtfGlobals = {
    globals: null,
    appService: null,
    mediaSoupService: null,
    lastError: null,
    
    find() {
      try {
        // Direct access to window.E_
        if (window.E_) {
          this.globals = window.E_;
          console.log('[VTF Inject] Found globals at window.E_');
          return true;
        }
        
        // Scan for globals with validation
        for (const key in window) {
          try {
            if (key.length <= 3 && typeof window[key] === 'object' && window[key]) {
              const obj = window[key];
              // Validate it has VTF-like properties
              if (obj.audioVolume !== undefined && obj.sessData !== undefined) {
                this.globals = obj;
                console.log(`[VTF Inject] Found globals at window.${key}`);
                return true;
              }
            }
          } catch (e) {
            // Skip protected properties
          }
        }
        
        // Check Angular contexts with error handling
        try {
          const webcam = document.getElementById('webcam');
          if (webcam && webcam.__ngContext__) {
            for (let i = 0; i < webcam.__ngContext__.length; i++) {
              const ctx = webcam.__ngContext__[i];
              if (ctx && ctx.appService && ctx.appService.globals) {
                this.globals = ctx.appService.globals;
                this.appService = ctx.appService;
                console.log('[VTF Inject] Found globals via Angular context');
                return true;
              }
            }
          }
        } catch (e) {
          this.lastError = e;
          console.warn('[VTF Inject] Error checking Angular context:', e);
        }
        
        return false;
      } catch (error) {
        this.lastError = error;
        console.error('[VTF Inject] Error in globals discovery:', error);
        return false;
      }
    }
  };
  
  // Enhanced message sender with error handling
  const sendMessage = (type, data, priority = 'normal') => {
    try {
      const message = {
        source: 'vtf-inject',
        type: type,
        data: data,
        timestamp: Date.now(),
        priority: priority
      };
      
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
  
  // Function Hooks with error reporting
  const hookVTFFunctions = () => {
    let hooksApplied = 0;
    
    // Hook reconnectAudio
    try {
      const targets = [
        window.reconnectAudio,
        vtfGlobals.appService?.reconnectAudio,
        vtfGlobals.mediaSoupService?.reconnectAudio
      ];
      
      for (let i = 0; i < targets.length; i++) {
        if (typeof targets[i] === 'function') {
          const original = targets[i];
          const newFunc = function(...args) {
            console.log('[VTF Inject] reconnectAudio called');
            sendMessage('vtfFunction', { 
              function: 'reconnectAudio',
              timestamp: Date.now() 
            }, 'high');
            return original.apply(this, args);
          };
          
          // Apply hook based on location
          if (i === 0) window.reconnectAudio = newFunc;
          else if (i === 1) vtfGlobals.appService.reconnectAudio = newFunc;
          else if (i === 2) vtfGlobals.mediaSoupService.reconnectAudio = newFunc;
          
          hooksApplied++;
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
        hooksApplied++;
      }
    } catch (error) {
      sendMessage('error', { 
        context: 'hookFunction',
        function: 'adjustVol',
        error: error.message 
      });
    }
    
    console.log(`[VTF Inject] Applied ${hooksApplied} function hooks`);
    return hooksApplied;
  };
  
  // Enhanced Audio Capture with error handling
  const audioCaptures = new Map();
  let captureErrors = 0;
  
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
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
        latencyHint: 'interactive'
      });
      
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
        capture.audioContext.close();
        audioCaptures.delete(userId);
        
        const duration = Date.now() - capture.startTime;
        sendMessage('captureStopped', { 
          userId,
          duration,
          chunks: capture.chunkCount 
        }, 'high');
      } catch (error) {
        console.error(`[VTF Inject] Error cleaning up ${userId}:`, error);
      }
    }
  };
  
  // Enhanced DOM Monitoring
  let observerRetries = 0;
  const MAX_OBSERVER_RETRIES = 5;
  
  const setupDOMObserver = () => {
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
      
      // Start observing with fallback
      const target = document.getElementById('topRoomDiv') || document.body;
      observer.observe(target, { 
        childList: true, 
        subtree: true,
        attributes: false // Don't need attribute monitoring
      });
      
      console.log(`[VTF Inject] DOM observer started on ${target.id || 'body'}`);
      return true;
      
    } catch (error) {
      observerRetries++;
      console.error('[VTF Inject] Failed to setup observer:', error);
      
      if (observerRetries < MAX_OBSERVER_RETRIES) {
        setTimeout(setupDOMObserver, 1000 * observerRetries);
      } else {
        sendMessage('error', {
          context: 'observer',
          error: 'Failed to setup DOM observer after retries'
        }, 'high');
      }
      
      return false;
    }
  };
  
  // Command Handler
  const handleCommand = (command) => {
    console.log('[VTF Inject] Received command:', command);
    
    switch (command) {
      case 'getState':
        sendMessage('state', {
          initialized: state.initialized,
          globalsFound: state.globalsFound,
          globals: !!vtfGlobals.globals,
          audioVolume: vtfGlobals.globals?.audioVolume,
          sessionState: vtfGlobals.globals?.sessData?.currentState,
          activeCaptures: Array.from(audioCaptures.keys()),
          captureErrors: captureErrors,
          errors: state.errors
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
          hookVTFFunctions();
        }
        sendMessage('stateRefreshed', { globalsFound: found });
        break;
    }
  };
  
  // Initialize with comprehensive error handling
  const initialize = () => {
    console.log('[VTF Inject] Starting initialization...');
    
    // Find globals with retry
    const findGlobalsWithRetry = (attempts = 0) => {
      if (vtfGlobals.find()) {
        state.globalsFound = true;
        sendMessage('globalsFound', { 
          hasGlobals: true,
          audioVolume: vtfGlobals.globals?.audioVolume,
          sessionState: vtfGlobals.globals?.sessData?.currentState
        }, 'high');
        
        // Apply hooks
        const hooksApplied = hookVTFFunctions();
        sendMessage('hooksApplied', { count: hooksApplied });
        
      } else if (attempts < 60) { // 30 seconds
        setTimeout(() => findGlobalsWithRetry(attempts + 1), 500);
      } else {
        state.errors.push({ 
          type: 'globalsDiscovery', 
          error: 'Timeout after 30 seconds' 
        });
        sendMessage('globalsFound', { 
          hasGlobals: false,
          error: vtfGlobals.lastError?.message || 'Not found after 60 attempts'
        }, 'high');
      }
    };
    
    // Start globals discovery
    findGlobalsWithRetry();
    
    // Setup DOM observer
    if (setupDOMObserver()) {
      // Process existing elements
      const existingElements = document.querySelectorAll('audio[id^="msRemAudio-"]');
      console.log(`[VTF Inject] Found ${existingElements.length} existing audio elements`);
      
      existingElements.forEach(element => {
        if (element.srcObject) {
          captureAudioElement(element);
        }
      });
    }
    
    // Mark as initialized
    state.initialized = true;
    sendMessage('initialized', {
      timestamp: Date.now(),
      captureErrors: captureErrors,
      errors: state.errors
    }, 'high');
  };
  
  // Listen for commands from content script
  window.addEventListener('message', (event) => {
    if (event.data.source !== 'vtf-content') return;
    
    try {
      handleCommand(event.data.type);
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
})();