// inject.js - Injected into page context to capture audio streams
(function() {
  console.log('[VTF Inject] Initializing audio capture...');
  
  let capturedStream = null;
  let audioContext = null;
  let sourceNode = null;
  let processorNode = null;
  let isCapturing = false;
  
  // Override getUserMedia to capture streams
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = async function(constraints) {
    const stream = await originalGetUserMedia.apply(this, arguments);
    console.log('[VTF Inject] getUserMedia intercepted');
    handleNewStream(stream);
    return stream;
  };
  
  // Monitor audio elements
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
          handleMediaElement(node);
        }
        if (node.querySelectorAll) {
          node.querySelectorAll('audio, video').forEach(handleMediaElement);
        }
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Check existing elements
  document.querySelectorAll('audio, video').forEach(handleMediaElement);
  
  function handleMediaElement(element) {
    if (element.srcObject) {
      console.log('[VTF Inject] Found media element with stream');
      handleNewStream(element.srcObject);
    }
    
    // Monitor for future srcObject changes
    let lastSrcObject = element.srcObject;
    const checkInterval = setInterval(() => {
      if (element.srcObject !== lastSrcObject) {
        lastSrcObject = element.srcObject;
        if (lastSrcObject) {
          handleNewStream(lastSrcObject);
        }
      }
    }, 1000);
    
    // Clean up when element is removed
    const cleanupObserver = new MutationObserver(() => {
      if (!document.contains(element)) {
        clearInterval(checkInterval);
        cleanupObserver.disconnect();
      }
    });
    cleanupObserver.observe(element.parentNode || document.body, {
      childList: true
    });
  }
  
  function handleNewStream(stream) {
    if (stream === capturedStream || !stream.getAudioTracks().length) return;
    
    console.log('[VTF Inject] Capturing new audio stream');
    capturedStream = stream;
    
    // Notify content script
    window.postMessage({
      type: 'VTF_STREAM_CAPTURED',
      hasAudio: true
    }, '*');
    
    if (isCapturing) {
      startAudioProcessing();
    }
  }
  
  function startAudioProcessing() {
    if (!capturedStream || !capturedStream.getAudioTracks().length) {
      console.log('[VTF Inject] No audio stream available');
      return;
    }
    
    try {
      // Create audio context
      audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });
      
      // Create source from stream
      sourceNode = audioContext.createMediaStreamSource(capturedStream);
      
      // Create processor
      processorNode = audioContext.createScriptProcessor(4096, 1, 1);
      
      processorNode.onaudioprocess = (e) => {
        if (!isCapturing) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        const audioData = Array.from(inputData);
        
        // Send to content script
        window.postMessage({
          type: 'VTF_AUDIO_DATA',
          audioData: audioData,
          sampleRate: audioContext.sampleRate,
          timestamp: Date.now()
        }, '*');
      };
      
      // Connect nodes
      sourceNode.connect(processorNode);
      processorNode.connect(audioContext.destination);
      
      console.log('[VTF Inject] Audio processing started');
    } catch (error) {
      console.error('[VTF Inject] Failed to start audio processing:', error);
    }
  }
  
  function stopAudioProcessing() {
    if (processorNode) {
      processorNode.disconnect();
      processorNode = null;
    }
    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    console.log('[VTF Inject] Audio processing stopped');
  }
  
  // Listen for control messages
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    switch (event.data.type) {
      case 'VTF_START_CAPTURE':
        isCapturing = true;
        startAudioProcessing();
        break;
      case 'VTF_STOP_CAPTURE':
        isCapturing = false;
        stopAudioProcessing();
        break;
    }
  });
  
  // Expose for debugging
  window.__vtfDebug = {
    capturedStream,
    isCapturing: () => isCapturing,
    restart: () => {
      stopAudioProcessing();
      startAudioProcessing();
    }
  };
})();