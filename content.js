// content.js - Content script that bridges page context and extension
console.log('[VTF Content] Loading...');

let isTranscribing = false;
let hasAudioStream = false;

// Inject the capture script
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() {
  this.remove();
  console.log('[VTF Content] Inject script loaded');
};
(document.head || document.documentElement).appendChild(script);

// Listen for messages from injected script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  switch (event.data.type) {
    case 'VTF_STREAM_CAPTURED':
      hasAudioStream = true;
      chrome.runtime.sendMessage({
        type: 'stream_status',
        hasAudio: true
      });
      break;
      
    case 'VTF_AUDIO_DATA':
      if (isTranscribing) {
        // Forward audio data to background
        chrome.runtime.sendMessage({
          type: 'audio_chunk',
          audioData: event.data.audioData,
          sampleRate: event.data.sampleRate,
          timestamp: event.data.timestamp
        });
      }
      break;
  }
});

// Listen for control messages from extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'start_transcription':
      isTranscribing = true;
      window.postMessage({ type: 'VTF_START_CAPTURE' }, '*');
      sendResponse({ success: true, hasAudioStream });
      break;
      
    case 'stop_transcription':
      isTranscribing = false;
      window.postMessage({ type: 'VTF_STOP_CAPTURE' }, '*');
      sendResponse({ success: true });
      break;
      
    case 'get_status':
      sendResponse({ isTranscribing, hasAudioStream });
      break;
  }
  return true;
});

// Auto-start if configured
chrome.storage.local.get(['autoStart'], (result) => {
  if (result.autoStart) {
    console.log('[VTF Content] Auto-starting transcription...');
    setTimeout(() => {
      isTranscribing = true;
      window.postMessage({ type: 'VTF_START_CAPTURE' }, '*');
    }, 3000);
  }
});