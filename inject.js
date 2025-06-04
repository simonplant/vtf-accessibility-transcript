// inject.js - Production-ready audio capture with full error handling
(function() {
  console.log('[VTF Inject] Initializing production audio capture v3.0');
  
  // State management
  const state = {
    isCapturing: false,
    processors: new Map(),
    audioContext: null,
    lastError: null,
    config: {
      sampleRate: 16000,
      silenceThreshold: 0.01,
      processorSize: 4096
    }
  };
  
  // Error reporting
  function reportError(error, context) {
    console.error(`[VTF Inject] Error in ${context}:`, error);
    state.lastError = { error: error.message, context, timestamp: Date.now() };
    window.postMessage({
      type: 'VTF_ERROR',
      error: error.message,
      context
    }, '*');
  }
  
  // Audio context management with resume support
  async function ensureAudioContext() {
    try {
      if (!state.audioContext) {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: state.config.sampleRate,
          latencyHint: 'balanced'
        });
      }
      
      // Handle suspended context (tab backgrounded)
      if (state.audioContext.state === 'suspended') {
        console.log('[VTF Inject] Resuming suspended AudioContext');
        await state.audioContext.resume();
      }
      
      return state.audioContext;
    } catch (error) {
      reportError(error, 'ensureAudioContext');
      return null;
    }
  }
  
  // Process individual audio stream
  async function processStream(stream, elementId) {
    if (!state.isCapturing) return;
    
    // Clean up existing processor for this element
    if (state.processors.has(elementId)) {
      cleanupProcessor(elementId);
    }
    
    try {
      const audioContext = await ensureAudioContext();
      if (!audioContext) return;
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(
        state.config.processorSize, 1, 1
      );
      
      let silentFrames = 0;
      const silentFramesThreshold = 10; // ~0.5 seconds of silence
      
      processor.onaudioprocess = (e) => {
        if (!state.isCapturing) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Enhanced silence detection
        const maxAmplitude = Math.max(...inputData.map(Math.abs));
        const hasAudio = maxAmplitude > state.config.silenceThreshold;
        
        if (hasAudio) {
          silentFrames = 0;
          const audioArray = Array.from(inputData);
          
          window.postMessage({
            type: 'VTF_AUDIO_DATA',
            audioData: audioArray,
            sampleRate: audioContext.sampleRate,
            timestamp: Date.now(),
            sourceId: elementId,
            amplitude: maxAmplitude
          }, '*');
        } else {
          silentFrames++;
          
          // Report extended silence
          if (silentFrames === silentFramesThreshold) {
            window.postMessage({
              type: 'VTF_SILENCE_DETECTED',
              sourceId: elementId
            }, '*');
          }
        }
      };
      
      // Connect pipeline
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      // Store for cleanup
      state.processors.set(elementId, {
        source,
        processor,
        stream,
        timestamp: Date.now()
      });
      
      console.log(`[VTF Inject] ✓ Processing audio from ${elementId}`);
      
      // Notify successful connection
      window.postMessage({
        type: 'VTF_STREAM_CONNECTED',
        sourceId: elementId
      }, '*');
      
    } catch (error) {
      reportError(error, `processStream:${elementId}`);
    }
  }
  
  // Cleanup individual processor
  function cleanupProcessor(elementId) {
    const processor = state.processors.get(elementId);
    if (!processor) return;
    
    try {
      processor.processor.disconnect();
      processor.source.disconnect();
      state.processors.delete(elementId);
      console.log(`[VTF Inject] Cleaned up processor for ${elementId}`);
    } catch (error) {
      console.warn(`[VTF Inject] Cleanup error for ${elementId}:`, error);
    }
  }
  
  // Scan for audio elements
  function scanForAudioElements() {
    const audioElements = document.querySelectorAll('audio[id^="msRemAudio"]');
    const foundElements = new Set();
    
    audioElements.forEach(audio => {
      foundElements.add(audio.id);
      
      if (audio.srcObject && !audio._vtfMonitored) {
        console.log(`[VTF Inject] Found new audio element: ${audio.id}`);
        audio._vtfMonitored = true;
        
        if (state.isCapturing) {
          processStream(audio.srcObject, audio.id);
        }
        
        // Monitor for srcObject changes
        let lastSrcObject = audio.srcObject;
        const observer = new MutationObserver(() => {
          if (audio.srcObject !== lastSrcObject) {
            console.log(`[VTF Inject] Stream changed for ${audio.id}`);
            lastSrcObject = audio.srcObject;
            
            if (audio.srcObject && state.isCapturing) {
              processStream(audio.srcObject, audio.id);
            } else if (!audio.srcObject) {
              cleanupProcessor(audio.id);
            }
          }
        });
        
        observer.observe(audio, {
          attributes: true,
          attributeFilter: ['src', 'srcObject']
        });
      }
    });
    
    // Cleanup processors for removed elements
    state.processors.forEach((_, elementId) => {
      if (!foundElements.has(elementId)) {
        console.log(`[VTF Inject] Element removed: ${elementId}`);
        cleanupProcessor(elementId);
        
        window.postMessage({
          type: 'VTF_STREAM_DISCONNECTED',
          sourceId: elementId
        }, '*');
      }
    });
  }
  
  // Start capturing
  async function startCapture() {
    console.log('[VTF Inject] Starting capture');
    state.isCapturing = true;
    
    await ensureAudioContext();
    scanForAudioElements();
    
    window.postMessage({
      type: 'VTF_CAPTURE_STARTED',
      activeStreams: Array.from(state.processors.keys())
    }, '*');
  }
  
  // Stop capturing
  function stopCapture() {
    console.log('[VTF Inject] Stopping capture');
    state.isCapturing = false;
    
    // Cleanup all processors
    state.processors.forEach((_, elementId) => cleanupProcessor(elementId));
    
    // Close audio context
    if (state.audioContext && state.audioContext.state !== 'closed') {
      state.audioContext.close();
      state.audioContext = null;
    }
    
    window.postMessage({ type: 'VTF_CAPTURE_STOPPED' }, '*');
  }
  
  // Update configuration
  function updateConfig(config) {
    Object.assign(state.config, config);
    console.log('[VTF Inject] Config updated:', state.config);
  }
  
  // Message handler
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    
    switch (event.data.type) {
      case 'VTF_START_CAPTURE':
        await startCapture();
        break;
        
      case 'VTF_STOP_CAPTURE':
        stopCapture();
        break;
        
      case 'VTF_UPDATE_CONFIG':
        updateConfig(event.data.config);
        break;
        
      case 'VTF_GET_STATUS':
        window.postMessage({
          type: 'VTF_STATUS_REPORT',
          isCapturing: state.isCapturing,
          activeStreams: Array.from(state.processors.keys()),
          audioContextState: state.audioContext?.state,
          lastError: state.lastError,
          config: state.config
        }, '*');
        break;
    }
  });
  
  // DOM monitoring
  const domObserver = new MutationObserver(() => {
    if (state.isCapturing) {
      scanForAudioElements();
    }
  });
  
  domObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Periodic scan for resilience
  setInterval(() => {
    if (state.isCapturing) {
      scanForAudioElements();
      ensureAudioContext(); // Check for suspended context
    }
  }, 2000);
  
  // Tab visibility handling
  document.addEventListener('visibilitychange', () => {
    if (state.isCapturing && !document.hidden) {
      console.log('[VTF Inject] Tab became visible, ensuring audio context');
      ensureAudioContext();
    }
  });
  
  // Initial scan
  scanForAudioElements();
  
  console.log('[VTF Inject] Ready - Production audio capture initialized');
  
  // Expose debug interface
  window.__vtfAudioDebug = {
    state,
    getStatus: () => ({
      isCapturing: state.isCapturing,
      activeStreams: Array.from(state.processors.keys()),
      audioContextState: state.audioContext?.state
    }),
    forceRescan: scanForAudioElements
  };
})();