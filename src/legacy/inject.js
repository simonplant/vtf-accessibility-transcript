// inject.js - VTF Audio Specification Compliant Implementation
(function() {
  console.log('[VTF Inject] Script loaded - VTF Spec Compliant Version');
  
  let audioContext = null;
  const activeProcessors = new Map();
  const streamMonitors = new Map();
  
  // Monitor srcObject changes on audio elements
  function monitorStreamChanges(audioElement) {
    const streamId = audioElement.id;
    
    if (streamMonitors.has(streamId)) {
      return; // Already monitoring
    }
    
    console.log(`[VTF Inject] Setting up stream monitor for: ${streamId}`);
    
    // Store original descriptor
    const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
    
    // Create a proxy for srcObject
    Object.defineProperty(audioElement, 'srcObject', {
      get: function() {
        return this._srcObject;
      },
      set: function(value) {
        console.log(`[VTF Inject] srcObject changed for ${streamId}`, value);
        this._srcObject = value;
        
        // Call original setter
        if (originalDescriptor && originalDescriptor.set) {
          originalDescriptor.set.call(this, value);
        }
        
        // Handle the stream change
        if (value instanceof MediaStream) {
          // Small delay to ensure VTF has finished setting up
          setTimeout(() => {
            captureAudioElement(audioElement);
          }, 100);
        }
      },
      configurable: true
    });
    
    streamMonitors.set(streamId, true);
  }
  
  // Function to capture audio from an element
  function captureAudioElement(audioElement) {
    const streamId = audioElement.id;
    const userId = streamId.replace('msRemAudio-', '');
    
    console.log(`[VTF Inject] Capture request for: ${streamId} (User: ${userId})`);
    
    // Check if stream exists
    if (!audioElement.srcObject || !(audioElement.srcObject instanceof MediaStream)) {
      console.log(`[VTF Inject] No valid stream for ${streamId}, skipping`);
      return;
    }
    
    // Stop existing capture if any
    if (activeProcessors.has(streamId)) {
      console.log(`[VTF Inject] Stopping existing capture for: ${streamId}`);
      stopCapture(streamId);
    }
    
    try {
      // Create audio context if needed (matching VTF's approach)
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000
        });
        console.log(`[VTF Inject] Created AudioContext, state: ${audioContext.state}`);
      }
      
      // Resume if suspended
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      
      // Create source from the MediaStream
      const source = audioContext.createMediaStreamSource(audioElement.srcObject);
      console.log(`[VTF Inject] Created MediaStreamSource for ${userId}`);
      
      // Create processor
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      let audioBuffer = [];
      let lastActivity = Date.now();
      const CHUNK_SIZE = 16000; // 1 second at 16kHz
      const SILENCE_THRESHOLD = 0.001;
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const maxSample = Math.max(...inputData.map(Math.abs));
        
        // Check if audio element is still playing
        if (audioElement.paused || !audioElement.srcObject) {
          return;
        }
        
        // Only process if we have real audio
        if (maxSample > SILENCE_THRESHOLD) {
          audioBuffer.push(...inputData);
          lastActivity = Date.now();
          
          if (audioBuffer.length >= CHUNK_SIZE) {
            const chunk = audioBuffer.slice(0, CHUNK_SIZE);
            audioBuffer = audioBuffer.slice(CHUNK_SIZE);
            
            console.log(`[VTF Inject] Sending chunk for ${userId}, max: ${maxSample.toFixed(4)}`);
            
            // Send to content script
            window.postMessage({
              type: 'VTF_AUDIO_DATA',
              streamId: streamId,
              userId: userId,
              audioData: chunk,
              timestamp: Date.now(),
              maxSample: maxSample,
              volume: audioElement.volume
            }, '*');
          }
        } else {
          // Handle silence - send partial buffer after timeout
          const silenceDuration = Date.now() - lastActivity;
          if (audioBuffer.length > 0 && silenceDuration > 2000) {
            console.log(`[VTF Inject] Sending partial chunk for ${userId} after silence`);
            
            // Pad to minimum size if needed
            while (audioBuffer.length < CHUNK_SIZE / 2) {
              audioBuffer.push(0);
            }
            
            const chunk = audioBuffer.slice(0, CHUNK_SIZE);
            audioBuffer = [];
            
            window.postMessage({
              type: 'VTF_AUDIO_DATA',
              streamId: streamId,
              userId: userId,
              audioData: chunk,
              timestamp: Date.now(),
              maxSample: 0,
              volume: audioElement.volume
            }, '*');
          }
        }
      };
      
      // Connect pipeline
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      // Store for cleanup
      activeProcessors.set(streamId, {
        source: source,
        processor: processor,
        element: audioElement,
        userId: userId
      });
      
      console.log(`[VTF Inject] Audio pipeline connected for ${userId}`);
      
    } catch (error) {
      console.error(`[VTF Inject] Error capturing ${streamId}:`, error);
    }
  }
  
  // Function to stop capture
  function stopCapture(streamId) {
    const nodes = activeProcessors.get(streamId);
    if (nodes) {
      console.log(`[VTF Inject] Stopping capture for: ${streamId}`);
      try {
        nodes.source.disconnect();
        nodes.processor.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      activeProcessors.delete(streamId);
    }
  }
  
  // VTF Audio Element Detection (following spec pattern)
  function isVTFAudioElement(node) {
    return node.nodeName === 'AUDIO' && 
           node.id && 
           node.id.startsWith('msRemAudio-');
  }
  
  // Handle VTF's reconnectAudio pattern
  function handleReconnect() {
    console.log('[VTF Inject] Detected audio reconnect - cleaning up');
    // Stop all captures
    activeProcessors.forEach((_, streamId) => {
      stopCapture(streamId);
    });
    streamMonitors.clear();
  }
  
  // Monitor for audio elements using VTF's DOM structure
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      // Handle added nodes
      mutation.addedNodes.forEach((node) => {
        if (isVTFAudioElement(node)) {
          const userId = node.id.replace('msRemAudio-', '');
          console.log(`[VTF Inject] New VTF audio element detected: ${node.id} (User: ${userId})`);
          
          // Set up monitoring for this element
          monitorStreamChanges(node);
          
          // Check if it already has a stream
          if (node.srcObject && node.srcObject instanceof MediaStream) {
            setTimeout(() => captureAudioElement(node), 100);
          }
        }
      });
      
      // Handle removed nodes (VTF's reconnectAudio removes all elements)
      mutation.removedNodes.forEach((node) => {
        if (isVTFAudioElement(node)) {
          console.log(`[VTF Inject] VTF audio element removed: ${node.id}`);
          stopCapture(node.id);
          streamMonitors.delete(node.id);
        }
      });
    });
  });
  
  // Start observing - prioritize topRoomDiv as per spec
  const topRoomDiv = document.getElementById('topRoomDiv');
  const observeTarget = topRoomDiv || document.body;
  
  observer.observe(observeTarget, {
    childList: true,
    subtree: true
  });
  
  console.log(`[VTF Inject] Observing ${observeTarget.id || 'document.body'} for VTF audio elements`);
  
  // Check existing elements
  document.querySelectorAll('audio[id^="msRemAudio-"]').forEach(audio => {
    console.log(`[VTF Inject] Found existing element: ${audio.id}`);
    monitorStreamChanges(audio);
    
    if (audio.srcObject && audio.srcObject instanceof MediaStream) {
      captureAudioElement(audio);
    }
  });
  
  // Listen for play events (VTF's playback pattern)
  document.addEventListener('play', (e) => {
    if (isVTFAudioElement(e.target)) {
      console.log(`[VTF Inject] Play event for ${e.target.id}`);
      if (e.target.srcObject) {
        setTimeout(() => captureAudioElement(e.target), 100);
      }
    }
  }, true);
  
  // Listen for pause events (VTF's stopListeningToPresenter pattern)
  document.addEventListener('pause', (e) => {
    if (isVTFAudioElement(e.target)) {
      console.log(`[VTF Inject] Pause event for ${e.target.id} - VTF stopped listening`);
      // Don't stop capture immediately - VTF might resume
    }
  }, true);
  
  // Monitor for VTF's volume adjustment
  let lastKnownVolume = 1.0;
  setInterval(() => {
    const audioElements = document.querySelectorAll('audio[id^="msRemAudio-"]');
    audioElements.forEach(audio => {
      if (audio.volume !== lastKnownVolume) {
        console.log(`[VTF Inject] Volume changed to: ${audio.volume}`);
        lastKnownVolume = audio.volume;
      }
    });
  }, 5000);
  
  // Expose for debugging
  window.VTFAudioDebug = {
    getActiveProcessors: () => activeProcessors,
    getAudioElements: () => document.querySelectorAll('audio[id^="msRemAudio-"]'),
    getAudioState: () => {
      const elements = document.querySelectorAll('audio[id^="msRemAudio-"]');
      return Array.from(elements).map(audio => ({
        id: audio.id,
        userId: audio.id.replace('msRemAudio-', ''),
        hasStream: !!audio.srcObject,
        isPlaying: !audio.paused,
        volume: audio.volume,
        currentTime: audio.currentTime
      }));
    }
  };
  
  console.log('[VTF Inject] VTF Audio Capture initialized. Debug available at window.VTFAudioDebug');
})();