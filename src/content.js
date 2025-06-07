// This runs in the CONTENT SCRIPT context (isolated from page)
// It CANNOT access window.E_ or MediaStreams directly

class VTFAudioExtension {
  constructor() {
    this.isInitialized = false;
    this.isCapturing = false;
    this.hookReady = false;
    this.activeUsers = new Set();
  }
  
  async init() {
    console.log('[VTF Extension] Initializing content script');
    
    // Step 1: Inject the audio hook script into the page
    this.injectAudioHook();
    
    // Step 2: Set up message handlers
    this.setupMessageHandlers();
    
    // Step 3: Set up Chrome runtime handlers
    this.setupChromeHandlers();
    
    // Step 4: Wait for hook to be ready
    await this.waitForHookReady();
    
    this.isInitialized = true;
    console.log('[VTF Extension] Content script initialized');
  }
  
  injectAudioHook() {
    console.log('[VTF Extension] Injecting audio hook...');
    
    // Inject our audio hook into the page
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject/audio-hook.js');
    script.onload = () => {
      console.log('[VTF Extension] Audio hook script loaded');
      script.remove();
    };
    script.onerror = (e) => {
      console.error('[VTF Extension] Failed to load audio hook:', e);
    };
    
    (document.head || document.documentElement).appendChild(script);
  }
  
  setupMessageHandlers() {
    // Listen for messages from injected script
    window.addEventListener('message', (event) => {
      // Only accept messages from our injected script
      if (event.data.source !== 'vtf-audio-hook') return;
      
      console.log('[VTF Extension] Message from hook:', event.data.type);
      
      switch (event.data.type) {
        case 'hookReady':
          this.hookReady = true;
          break;
          
        case 'audioData':
          // Forward audio data to background
          this.sendToBackground({
            type: 'audioChunk',
            ...event.data.data
          });
          break;
          
        case 'captureStarted':
          this.activeUsers.add(event.data.data.userId);
          this.sendToBackground({
            type: 'userJoined',
            userId: event.data.data.userId
          });
          break;
          
        case 'captureStopped':
          this.activeUsers.delete(event.data.data.userId);
          this.sendToBackground({
            type: 'userLeft',
            userId: event.data.data.userId
          });
          break;
          
        case 'volumeChanged':
          this.sendToBackground({
            type: 'volumeChanged',
            volume: event.data.data.volume
          });
          break;
          
        case 'status':
          // Handle status responses
          break;
          
        case 'captureError':
          console.error('[VTF Extension] Capture error:', event.data.data);
          break;
      }
    });
  }
  
  setupChromeHandlers() {
    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('[VTF Extension] Chrome message:', request.type);
      
      switch (request.type) {
        case 'startCapture':
          this.startCapture();
          sendResponse({ status: 'started' });
          break;
          
        case 'stopCapture':
          this.stopCapture();
          sendResponse({ status: 'stopped' });
          break;
          
        case 'getStatus':
          sendResponse({
            initialized: this.isInitialized,
            capturing: this.isCapturing,
            hookReady: this.hookReady,
            activeUsers: Array.from(this.activeUsers)
          });
          break;
          
        case 'transcription':
          // Display transcription in UI
          this.displayTranscription(request.data);
          break;
      }
      
      return false; // Synchronous response
    });
  }
  
  async waitForHookReady() {
    return new Promise((resolve) => {
      if (this.hookReady) {
        resolve();
        return;
      }
      
      const checkInterval = setInterval(() => {
        if (this.hookReady) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        console.error('[VTF Extension] Hook ready timeout');
        resolve(); // Resolve anyway to not block
      }, 10000);
    });
  }
  
  startCapture() {
    if (!this.hookReady) {
      console.error('[VTF Extension] Cannot start capture - hook not ready');
      return;
    }
    
    this.isCapturing = true;
    
    // Send command to injected script
    window.postMessage({
      source: 'vtf-extension-command',
      type: 'startCapture'
    }, '*');
    
    // Notify background
    this.sendToBackground({ type: 'captureStarted' });
  }
  
  stopCapture() {
    this.isCapturing = false;
    
    // Send command to injected script
    window.postMessage({
      source: 'vtf-extension-command',
      type: 'stopCapture'
    }, '*');
    
    // Notify background
    this.sendToBackground({ type: 'captureStopped' });
  }
  
  sendToBackground(message) {
    chrome.runtime.sendMessage(message).catch((error) => {
      console.error('[VTF Extension] Failed to send to background:', error);
    });
  }
  
  displayTranscription(transcription) {
    // Simple UI display (implement as needed)
    console.log('[VTF Extension] Transcription:', transcription);
  }
}

// Initialize extension
console.log('[VTF Extension] Content script loading');
const vtfExtension = new VTFAudioExtension();
vtfExtension.init();