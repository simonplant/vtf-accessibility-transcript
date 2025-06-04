// background.js - Handles audio chunks and OpenAI Whisper transcription

let apiKey = null;
let audioBuffers = new Map(); // Store audio buffers per tab
let transcriptionQueue = [];
let isProcessing = false;

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  console.log('[VTF] Extension installed');
});

// Load API key on startup
chrome.storage.local.get(['apiKey'], (result) => {
  apiKey = result.apiKey;
});

// Listen for API key updates
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.apiKey) {
    apiKey = changes.apiKey.newValue;
  }
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'audio_chunk':
      handleAudioChunk(message, sender.tab.id);
      break;
    case 'get_api_key':
      sendResponse({ apiKey });
      break;
    case 'transcription_status':
      sendResponse({ isProcessing });
      break;
  }
  return true;
});

function handleAudioChunk(message, tabId) {
  const { audioData, sampleRate, timestamp } = message;
  
  // Initialize buffer for this tab if needed
  if (!audioBuffers.has(tabId)) {
    audioBuffers.set(tabId, {
      data: [],
      sampleRate: sampleRate,
      lastTimestamp: timestamp
    });
  }
  
  const buffer = audioBuffers.get(tabId);
  buffer.data.push(...audioData);
  
  // Process every 5 seconds of audio (5 * sampleRate samples)
  const chunkSize = 5 * sampleRate;
  if (buffer.data.length >= chunkSize) {
    const chunk = buffer.data.splice(0, chunkSize);
    queueTranscription(tabId, chunk, sampleRate, timestamp);
  }
}

function queueTranscription(tabId, audioData, sampleRate, timestamp) {
  transcriptionQueue.push({
    tabId,
    audioData,
    sampleRate,
    timestamp
  });
  
  processQueue();
}

async function processQueue() {
  if (isProcessing || transcriptionQueue.length === 0 || !apiKey) return;
  
  isProcessing = true;
  const item = transcriptionQueue.shift();
  
  try {
    const wavBlob = createWavBlob(item.audioData, item.sampleRate);
    const transcript = await transcribeAudio(wavBlob);
    
    if (transcript) {
      // Send to popup
      chrome.runtime.sendMessage({
        type: 'transcript_update',
        tabId: item.tabId,
        text: transcript,
        timestamp: item.timestamp
      }).catch(() => {
        // Popup might be closed
      });
      
      // Save to storage
      saveTranscript(item.tabId, transcript, item.timestamp);
    }
  } catch (error) {
    console.error('[VTF] Transcription error:', error);
    chrome.runtime.sendMessage({
      type: 'transcription_error',
      error: error.message
    }).catch(() => {});
  }
  
  isProcessing = false;
  // Process next item
  setTimeout(processQueue, 100);
}

async function transcribeAudio(wavBlob) {
  const formData = new FormData();
  formData.append('file', wavBlob, 'audio.wav');
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');
  formData.append('response_format', 'text');
  
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });
  
  if (!response.ok) {
    throw new Error(`Whisper API error: ${response.status}`);
  }
  
  return await response.text();
}

function createWavBlob(float32Array, sampleRate) {
  const length = float32Array.length;
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
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

async function saveTranscript(tabId, text, timestamp) {
  const key = `transcript_${tabId}`;
  const { [key]: existing = [] } = await chrome.storage.local.get(key);
  
  existing.push({
    text,
    timestamp,
    date: new Date().toISOString()
  });
  
  // Keep last 1000 entries
  if (existing.length > 1000) {
    existing.splice(0, existing.length - 1000);
  }
  
  await chrome.storage.local.set({ [key]: existing });
}