// background.js - Production service worker with queue management
console.log('[VTF Background] Starting production service worker v3.0');

// State management
const state = {
  apiKey: null,
  transcriptionQueue: [],
  isProcessing: false,
  stats: {
    transcriptionsCompleted: 0,
    transcriptionsFailed: 0,
    totalProcessingTime: 0
  }
};

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  console.log('[VTF Background] Extension installed/updated');
  
  // Set default options
  chrome.storage.local.get(['bufferSeconds', 'autoStart'], (result) => {
    const defaults = {
      bufferSeconds: result.bufferSeconds || 5,
      autoStart: result.autoStart !== undefined ? result.autoStart : false
    };
    chrome.storage.local.set(defaults);
  });
});

// Load API key
async function loadApiKey() {
  const result = await chrome.storage.local.get(['apiKey']);
  state.apiKey = result.apiKey;
  
  if (!state.apiKey) {
    console.warn('[VTF Background] No API key configured');
  } else {
    console.log('[VTF Background] API key loaded');
  }
  
  return !!state.apiKey;
}

// Initial load
loadApiKey();

// Monitor storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.apiKey) {
    state.apiKey = changes.apiKey.newValue;
    console.log('[VTF Background] API key updated');
    
    // Process any queued items if we now have a key
    if (state.apiKey && state.transcriptionQueue.length > 0) {
      processQueue();
    }
  }
});

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'audio_chunk':
      handleAudioChunk(request, sender.tab?.id);
      break;
      
    case 'get_api_status':
      sendResponse({ 
        hasApiKey: !!state.apiKey,
        queueLength: state.transcriptionQueue.length,
        stats: state.stats
      });
      break;
  }
  return true;
});

// Handle incoming audio chunks
function handleAudioChunk(request, tabId) {
  if (!state.apiKey) {
    console.warn('[VTF Background] Skipping transcription - no API key');
    
    // Notify popup
    chrome.runtime.sendMessage({
      type: 'transcription_error',
      error: 'No API key configured',
      timestamp: Date.now()
    }).catch(() => {});
    
    return;
  }
  
  // Queue for processing
  state.transcriptionQueue.push({
    audioData: request.audioData,
    sampleRate: request.sampleRate,
    timestamp: request.timestamp,
    tabId: tabId,
    queuedAt: Date.now()
  });
  
  console.log(`[VTF Background] Queued audio chunk, queue length: ${state.transcriptionQueue.length}`);
  
  // Start processing if not already running
  if (!state.isProcessing) {
    processQueue();
  }
}

// Process transcription queue
async function processQueue() {
  if (state.isProcessing || state.transcriptionQueue.length === 0 || !state.apiKey) {
    return;
  }
  
  state.isProcessing = true;
  
  while (state.transcriptionQueue.length > 0 && state.apiKey) {
    const item = state.transcriptionQueue.shift();
    const startTime = Date.now();
    
    try {
      // Create WAV blob
      const wavBlob = createWavBlob(item.audioData, item.sampleRate);
      
      // Call Whisper API
      const formData = new FormData();
      formData.append('file', wavBlob, 'audio.wav');
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');
      formData.append('response_format', 'json');
      formData.append('temperature', '0.2');
      
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.apiKey}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Whisper API error: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      const processingTime = Date.now() - startTime;
      
      if (result.text && result.text.trim()) {
        console.log(`[VTF Background] Transcription completed in ${processingTime}ms:`, result.text);
        
        // Update stats
        state.stats.transcriptionsCompleted++;
        state.stats.totalProcessingTime += processingTime;
        
        // Send to popup
        chrome.runtime.sendMessage({
          type: 'transcript_update',
          text: result.text.trim(),
          timestamp: item.timestamp,
          tabId: item.tabId,
          processingTime: processingTime,
          queueDelay: startTime - item.queuedAt
        }).catch(() => {});
        
        // Save to storage
        await saveTranscript(item.tabId, result.text.trim(), item.timestamp);
      }
      
    } catch (error) {
      console.error('[VTF Background] Transcription error:', error);
      state.stats.transcriptionsFailed++;
      
      // Notify popup
      chrome.runtime.sendMessage({
        type: 'transcription_error',
        error: error.message,
        timestamp: Date.now()
      }).catch(() => {});
      
      // Rate limit handling
      if (error.message.includes('429')) {
        console.log('[VTF Background] Rate limited, waiting 10 seconds');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
    // Small delay between requests
    if (state.transcriptionQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  state.isProcessing = false;
  console.log('[VTF Background] Queue processing completed');
}

// Create WAV blob from audio data
function createWavBlob(audioData, sampleRate) {
  const length = audioData.length;
  const arrayBuffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(arrayBuffer);
  
  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * 2, true);
  
  // Convert float32 to int16
  let offset = 44;
  for (let i = 0; i < length; i++, offset += 2) {
    const sample = Math.max(-1, Math.min(1, audioData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// Save transcript to storage
async function saveTranscript(tabId, text, timestamp) {
  const key = `transcript_${tabId}`;
  const result = await chrome.storage.local.get(key);
  const transcripts = result[key] || [];
  
  transcripts.push({
    text: text,
    timestamp: timestamp,
    date: new Date().toISOString()
  });
  
  // Keep last 10000 entries (full trading day)
  if (transcripts.length > 10000) {
    transcripts.splice(0, transcripts.length - 10000);
  }
  
  await chrome.storage.local.set({ [key]: transcripts });
}

// Export functionality
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'export_transcripts') {
    exportTranscripts(request.tabId).then(sendResponse);
    return true;
  }
});

async function exportTranscripts(tabId) {
  const key = `transcript_${tabId}`;
  const result = await chrome.storage.local.get(key);
  const transcripts = result[key] || [];
  
  let content = 'VTF Trading Floor Transcript\n';
  content += `Exported: ${new Date().toLocaleString()}\n`;
  content += `Total entries: ${transcripts.length}\n`;
  content += '='.repeat(50) + '\n\n';
  
  transcripts.forEach(entry => {
    const time = new Date(entry.date).toLocaleTimeString();
    content += `[${time}] ${entry.text}\n\n`;
  });
  
  return content;
}

console.log('[VTF Background] Production service worker ready');