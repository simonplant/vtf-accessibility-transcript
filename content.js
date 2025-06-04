// content.js - Production bridge with full error handling and recovery
console.log('[VTF Content] Loading production bridge v3.0');

// State management
const state = {
  isTranscribing: false,
  audioBuffer: [],
  bufferSize: 16000 * 5, // Default 5 seconds
  stats: {
    chunksReceived: 0,
    chunksSent: 0,
    errors: 0,
    lastActivity: null
  }
};

// Load configuration
chrome.storage.local.get(['bufferSeconds', 'silenceThreshold'], (result) => {
  if (result.bufferSeconds) {
    state.bufferSize = 16000 * result.bufferSeconds;
    console.log(`[VTF Content] Buffer size set to ${result.bufferSeconds} seconds`);
  }
});

// Inject the capture script
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() {
  this.remove();
  console.log('[VTF Content] Inject script loaded');
  
  // Request initial status
  setTimeout(() => {
    window.postMessage({ type: 'VTF_GET_STATUS' }, '*');
  }, 1000);
};
(document.head || document.documentElement).appendChild(script);

// Handle messages from injected script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  switch (event.data.type) {
    case 'VTF_AUDIO_DATA':
      if (state.isTranscribing) {
        handleAudioData(event.data);
      }
      break;
      
    case 'VTF_ERROR':
      handleError(event.data);
      break;
      
    case 'VTF_STREAM_CONNECTED':
      notifyStreamStatus('connected', event.data.sourceId);
      break;
      
    case 'VTF_STREAM_DISCONNECTED':
      notifyStreamStatus('disconnected', event.data.sourceId);
      break;
      
    case 'VTF_CAPTURE_STARTED':
      notifyStatus('capture_started', event.data);
      break;
      
    case 'VTF_CAPTURE_STOPPED':
      notifyStatus('capture_stopped');
      break;
      
    case 'VTF_STATUS_REPORT':
      handleStatusReport(event.data);
      break;
      
    case 'VTF_SILENCE_DETECTED':
      notifyStatus('silence_detected', { sourceId: event.data.sourceId });
      break;
  }
});

// Process audio data
function handleAudioData(data) {
  state.stats.chunksReceived++;
  state.stats.lastActivity = Date.now();
  
  // Add to buffer
  state.audioBuffer.push(...data.audioData);
  
  // Send when buffer is full
  if (state.audioBuffer.length >= state.bufferSize) {
    const chunk = state.audioBuffer.slice(0, state.bufferSize);
    state.audioBuffer = state.audioBuffer.slice(state.bufferSize);
    
    sendAudioChunk(chunk, data.sampleRate, data.timestamp);
  }
}

// Send audio chunk to background
async function sendAudioChunk(audioData, sampleRate, timestamp) {
  try {
    await chrome.runtime.sendMessage({
      type: 'audio_chunk',
      audioData: audioData,
      sampleRate: sampleRate,
      timestamp: timestamp
    });
    
    state.stats.chunksSent++;
  } catch (error) {
    state.stats.errors++;
    console.error('[VTF Content] Failed to send audio chunk:', error);
    
    // Notify popup of error
    notifyError('Failed to send audio to background worker');
  }
}

// Error handling
function handleError(errorData) {
  state.stats.errors++;
  console.error(`[VTF Content] Error from inject: ${errorData.context}`, errorData.error);
  notifyError(errorData.error, errorData.context);
}

// Notify popup of errors
function notifyError(message, context = '') {
  chrome.runtime.sendMessage({
    type: 'error',
    message: message,
    context: context,
    timestamp: Date.now()
  }).catch(() => {
    // Popup might be closed
  });
}

// Notify popup of status changes
function notifyStatus(status, data = {}) {
  chrome.runtime.sendMessage({
    type: 'status_update',
    status: status,
    data: data,
    timestamp: Date.now()
  }).catch(() => {
    // Popup might be closed
  });
}

// Notify stream status
function notifyStreamStatus(status, sourceId) {
  chrome.runtime.sendMessage({
    type: 'stream_status',
    status: status,
    sourceId: sourceId,
    timestamp: Date.now()
  }).catch(() => {});
}

// Handle status report
function handleStatusReport(status) {
  console.log('[VTF Content] Status report:', status);
  
  chrome.runtime.sendMessage({
    type: 'full_status',
    ...status,
    contentStats: state.stats
  }).catch(() => {});
}

// Extension message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[VTF Content] Extension message:', request.type);
  
  switch (request.type) {
    case 'start_transcription':
      state.isTranscribing = true;
      state.audioBuffer = []; // Clear buffer
      state.stats = { ...state.stats, chunksReceived: 0, chunksSent: 0, errors: 0 };
      
      window.postMessage({ type: 'VTF_START_CAPTURE' }, '*');
      sendResponse({ success: true });
      break;
      
    case 'stop_transcription':
      state.isTranscribing = false;
      
      // Send any remaining audio
      if (state.audioBuffer.length > 0) {
        sendAudioChunk(state.audioBuffer, 16000, Date.now());
        state.audioBuffer = [];
      }
      
      window.postMessage({ type: 'VTF_STOP_CAPTURE' }, '*');
      sendResponse({ success: true });
      break;
      
    case 'get_status':
      window.postMessage({ type: 'VTF_GET_STATUS' }, '*');
      sendResponse({ 
        isTranscribing: state.isTranscribing,
        stats: state.stats
      });
      break;
      
    case 'update_config':
      if (request.config.bufferSeconds) {
        state.bufferSize = 16000 * request.config.bufferSeconds;
      }
      
      window.postMessage({
        type: 'VTF_UPDATE_CONFIG',
        config: request.config
      }, '*');
      
      sendResponse({ success: true });
      break;
  }
  
  return true;
});

// Auto-start if configured
chrome.storage.local.get(['autoStart'], (result) => {
  if (result.autoStart) {
    console.log('[VTF Content] Auto-start enabled');
    setTimeout(() => {
      state.isTranscribing = true;
      window.postMessage({ type: 'VTF_START_CAPTURE' }, '*');
    }, 3000);
  }
});

// Heartbeat for connection monitoring
setInterval(() => {
  if (state.isTranscribing && state.stats.lastActivity) {
    const timeSinceLastActivity = Date.now() - state.stats.lastActivity;
    
    if (timeSinceLastActivity > 30000) { // 30 seconds
      console.warn('[VTF Content] No audio activity for 30 seconds');
      notifyStatus('no_activity', { duration: timeSinceLastActivity });
    }
  }
}, 10000);

console.log('[VTF Content] Ready - Production bridge initialized');