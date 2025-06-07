// inject.js - Runs in PAGE context
// Handles all VTF page context logic: finding globals, hooking functions, monitoring DOM, capturing audio, and sending data to the extension
// It has full access to VTF's JavaScript objects and MediaStreams

(function() {
  'use strict';
  
  console.log('[VTF Audio Hook] Initializing in page context');
  
  // State management
  const capturedElements = new Map(); // userId -> capture info
  const audioProcessors = new Map();  // userId -> processor info
  
  // Configuration (matches extension settings)
  const CONFIG = {
    sampleRate: 16000,
    bufferSize: 4096,
    silenceThreshold: 0.001,
    chunkSize: 16384  // 1 second at 16kHz
  };
  
  // Step 1: Find or wait for VTF globals
  function findVTFGlobals() {
    console.log('[VTF Audio Hook] Starting globals search in PAGE context');
    // Try direct access first
    if (window.E_) {
      console.log('[VTF Audio Hook] Found globals at window.E_');
      sendMessage('globalsFound', { path: 'window.E_', globals: extractGlobalsInfo(window.E_) });
      return window.E_;
    }
    // Try Angular context approach (this WILL work in page context)
    const checkElements = [
      { id: 'webcam', indices: [8, 9, 10, 11, 12] },
      { id: 'topRoomDiv', indices: [8, 9, 10, 11, 12] }
    ];
    for (const { id, indices } of checkElements) {
      const element = document.getElementById(id);
      if (element && element.__ngContext__) {
        for (const index of indices) {
          try {
            const context = element.__ngContext__[index];
            if (context?.appService?.globals) {
              console.log(`[VTF Audio Hook] Found globals via ${id}.__ngContext__[${index}]`);
              const globals = context.appService.globals;
              sendMessage('globalsFound', { 
                path: `${id}.__ngContext__[${index}].appService.globals`,
                globals: extractGlobalsInfo(globals)
              });
              return globals;
            }
          } catch (e) {
            // Continue searching
          }
        }
      }
    }
    return null;
  }
  
  function extractGlobalsInfo(globals) {
    return {
      audioVolume: globals.audioVolume,
      sessionState: globals.sessData?.currentState,
      hasGlobals: true
    };
  }
  
  function waitForGlobals() {
    let attempts = 0;
    const maxAttempts = 60;
    const interval = setInterval(() => {
      attempts++;
      console.log(`[VTF Audio Hook] Globals search attempt ${attempts}/${maxAttempts}`);
      const globals = findVTFGlobals();
      if (globals) {
        clearInterval(interval);
        initializeVTFHooks(globals);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.error('[VTF Audio Hook] Globals not found after timeout');
        sendMessage('globalsFailed', { attempts });
      }
    }, 500);
  }
  
  // Start the search immediately
  waitForGlobals();
  
  // Step 2: Hook into VTF's audio system
  function initializeVTFHooks(globals) {
    console.log('[VTF Audio Hook] Initializing with globals:', globals);
    
    // Hook audio element play method
    const originalPlay = HTMLAudioElement.prototype.play;
    HTMLAudioElement.prototype.play = function() {
      if (this.id && this.id.startsWith('msRemAudio-')) {
        const userId = this.id.replace('msRemAudio-', '');
        console.log('[VTF Audio Hook] Audio element playing:', this.id);
        
        // Start capture when play is called
        if (this.srcObject && !capturedElements.has(userId)) {
          startAudioCapture(this, userId);
        }
      }
      
      return originalPlay.apply(this, arguments);
    };
    
    // Hook into VTF's audio functions if available
    hookVTFunctions(globals);
  }
  
  // Step 3: Audio capture implementation
  function startAudioCapture(audioElement, userId) {
    try {
      const stream = audioElement.srcObject;
      if (!stream || !(stream instanceof MediaStream)) {
        console.warn('[VTF Audio Hook] Invalid stream for', userId);
        return;
      }
      
      // Create audio context at correct sample rate
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: CONFIG.sampleRate
      });
      
      // Create source from stream
      const source = audioContext.createMediaStreamSource(stream);
      
      // Create processor (ScriptProcessor as we're in page context)
      const processor = audioContext.createScriptProcessor(CONFIG.bufferSize, 1, 1);
      
      // Buffer for accumulating samples
      const buffer = [];
      
      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Check for silence
        const maxSample = Math.max(...Array.from(inputData).map(Math.abs));
        if (maxSample < CONFIG.silenceThreshold) return;
        
        // Accumulate samples
        buffer.push(...inputData);
        
        // Send complete chunks
        while (buffer.length >= CONFIG.chunkSize) {
          const chunk = buffer.splice(0, CONFIG.chunkSize);
          sendAudioData(userId, chunk);
        }
      };
      
      // Connect audio graph
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      // Store capture info
      const captureInfo = {
        element: audioElement,
        stream,
        audioContext,
        source,
        processor,
        buffer,
        startTime: Date.now()
      };
      
      capturedElements.set(userId, captureInfo);
      audioProcessors.set(userId, processor);
      
      // Notify extension
      sendMessage('captureStarted', { userId });
      
      console.log('[VTF Audio Hook] Started capture for', userId);
      
      // Monitor for element removal or stream end
      monitorAudioElement(audioElement, userId);
      
    } catch (error) {
      console.error('[VTF Audio Hook] Capture error:', error);
      sendMessage('captureError', { userId, error: error.message });
    }
  }
  
  // Step 4: Data transmission to extension
  function sendAudioData(userId, samples) {
    // Convert Float32 to Int16 for efficient transfer
    const int16Data = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    sendMessage('audioData', {
      userId,
      chunk: Array.from(int16Data), // Convert to regular array for postMessage
      timestamp: Date.now(),
      sampleRate: CONFIG.sampleRate
    });
  }
  
  // Step 5: Hook VTF-specific functions
  function hookVTFunctions(globals) {
    // Hook reconnectAudio if it exists
    const reconnectAudio = findFunction('reconnectAudio', globals);
    if (reconnectAudio) {
      const original = reconnectAudio.fn;
      reconnectAudio.obj[reconnectAudio.prop] = function() {
        console.log('[VTF Audio Hook] reconnectAudio called');
        stopAllCaptures();
        const result = original.apply(this, arguments);
        // Re-scan for audio elements after reconnect
        setTimeout(scanForAudioElements, 1000);
        return result;
      };
    }
    
    // Hook volume changes
    const adjustVol = findFunction('adjustVol', globals);
    if (adjustVol) {
      const original = adjustVol.fn;
      adjustVol.obj[adjustVol.prop] = function(event) {
        const result = original.apply(this, arguments);
        updateVolume(globals.audioVolume || 1.0);
        return result;
      };
    }
  }
  
  // Helper: Find function in various possible locations
  function findFunction(name, globals) {
    const locations = [
      { obj: window, prop: name },
      { obj: globals, prop: name },
      { obj: globals.mediaSoupService, prop: name },
      { obj: globals.appService, prop: name }
    ];
    
    for (const loc of locations) {
      if (loc.obj && typeof loc.obj[loc.prop] === 'function') {
        return { obj: loc.obj, prop: loc.prop, fn: loc.obj[loc.prop] };
      }
    }
    return null;
  }
  
  // Helper: Monitor audio element lifecycle
  function monitorAudioElement(element, userId) {
    // Use MutationObserver to detect removal
    const observer = new MutationObserver(() => {
      if (!element.isConnected) {
        console.log('[VTF Audio Hook] Element removed:', userId);
        stopCapture(userId);
        observer.disconnect();
      }
    });
    
    observer.observe(element.parentNode || document.body, {
      childList: true
    });
    
    // Monitor stream tracks
    const stream = element.srcObject;
    if (stream) {
      stream.getTracks().forEach(track => {
        track.onended = () => {
          console.log('[VTF Audio Hook] Track ended:', userId);
          stopCapture(userId);
        };
      });
    }
  }
  
  // Helper: Stop capture for a user
  function stopCapture(userId) {
    const capture = capturedElements.get(userId);
    if (!capture) return;
    
    try {
      // Send any remaining buffered data
      if (capture.buffer.length > 0) {
        sendAudioData(userId, capture.buffer);
      }
      
      // Disconnect audio nodes
      capture.source.disconnect();
      capture.processor.disconnect();
      capture.audioContext.close();
      
      capturedElements.delete(userId);
      audioProcessors.delete(userId);
      
      sendMessage('captureStopped', { userId });
      
    } catch (error) {
      console.error('[VTF Audio Hook] Error stopping capture:', error);
    }
  }
  
  // Helper: Stop all captures
  function stopAllCaptures() {
    console.log('[VTF Audio Hook] Stopping all captures');
    for (const userId of capturedElements.keys()) {
      stopCapture(userId);
    }
  }
  
  // Helper: Scan for existing audio elements
  function scanForAudioElements() {
    const elements = document.querySelectorAll('audio[id^="msRemAudio-"]');
    elements.forEach(element => {
      if (element.srcObject) {
        const userId = element.id.replace('msRemAudio-', '');
        if (!capturedElements.has(userId)) {
          startAudioCapture(element, userId);
        }
      }
    });
  }
  
  // Helper: Update volume for all captures
  function updateVolume(volume) {
    // Note: In page context, we might not have gain nodes
    // This is primarily for tracking/logging
    console.log('[VTF Audio Hook] Volume updated:', volume);
    sendMessage('volumeChanged', { volume });
  }
  
  // Message passing to extension
  function sendMessage(type, data) {
    window.postMessage({
      source: 'vtf-audio-hook',
      type,
      data,
      timestamp: Date.now()
    }, '*');
  }
  
  // Listen for commands from extension
  window.addEventListener('message', (event) => {
    if (event.data.source !== 'vtf-extension-command') return;
    
    switch (event.data.type) {
      case 'startCapture':
        scanForAudioElements();
        break;
        
      case 'stopCapture':
        stopAllCaptures();
        break;
        
      case 'getStatus':
        sendMessage('status', {
          capturing: capturedElements.size > 0,
          users: Array.from(capturedElements.keys()),
          globals: !!findVTFGlobals()
        });
        break;
    }
  });
  
})(); 