import { VTFGlobalsFinder } from './modules/vtf-globals-finder.js';
import { VTFStreamMonitor } from './modules/vtf-stream-monitor.js';
import { VTFStateMonitor } from './modules/vtf-state-monitor.js';
import { VTFAudioCapture } from './modules/vtf-audio-capture.js';
import { AudioDataTransfer } from './modules/audio-data-transfer.js';

class VTFAudioExtension {
  constructor() {
    
    this.globalsFinder = new VTFGlobalsFinder();
    this.audioCapture = new VTFAudioCapture();
    this.streamMonitor = new VTFStreamMonitor();
    this.stateMonitor = new VTFStateMonitor();
    
    
    this.audioElements = new Map();      
    this.activeCaptures = new Map();     
    this.pendingStreams = new Map();     
    
    
    this.config = {
      autoStart: true,                   
      globalsTimeout: 30000,             
      enableDebugLogs: false,
      retryInterval: 5000,               
      notificationDuration: 5000         
    };
    
    
    this.isInitialized = false;
    this.isCapturing = false;
    this.initializationError = null;
    
    
    this.domObserver = null;
    
    
    this.metrics = {
      capturesStarted: 0,
      capturesFailed: 0,
      reconnects: 0,
      errors: 0
    };
  }
  
  
  injectAudioHook() {
    // Inject our audio hook into the page
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject/audio-hook.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
    // Listen for messages from injected script
    window.addEventListener('message', (event) => {
      if (event.data.source !== 'vtf-audio-hook') return;
      switch (event.data.type) {
        case 'hookReady':
          console.log('[VTF Extension] Audio hook ready');
          break;
        case 'audioData':
          // Forward to background
          chrome.runtime.sendMessage({
            type: 'audioChunk',
            userId: event.data.data.userId,
            chunk: event.data.data.samples,
            timestamp: event.data.data.timestamp,
            sampleRate: 16000
          });
          break;
        case 'captureStarted':
          console.log('[VTF Extension] Capture started for', event.data.data.userId);
          break;
      }
    });
  }
  
  
  async init() {
    
    try {
      
      
      const globalsFound = await this.globalsFinder.waitForGlobals(
        Math.floor(this.config.globalsTimeout / 500),
        500
      );
      
      if (!globalsFound) {
        throw new Error('VTF globals not found after timeout');
      }
      
      
      
      
      await this.audioCapture.initialize();
      
      
      this.audioCapture.globalsFinder = this.globalsFinder;
      
      
      
      this.stateMonitor.startSync(this.globalsFinder, 1000);
      
      
      
      this.setupEventHandlers();
      
      
      
      this.setupDOMObserver();
      
      
      
      this.scanExistingElements();
      
      
      
      this.setupMessageHandlers();
      
      
      // Inject audio hook after globals are found
      this.injectAudioHook();
      
      
      const settings = await this.loadSettings();
      if (settings.autoStart !== false && this.config.autoStart) {
        
        await this.startCapture();
      }
      
      this.isInitialized = true;
      
      
      this.sendMessage({
        type: 'extensionInitialized',
        status: this.getStatus()
      });
      
    } catch (error) {
      console.error('[VTF Extension] Initialization failed:', error);
      this.initializationError = error.message;
      this.notifyUser(`VTF Extension: ${error.message}`);
      
      
      if (error.message.includes('VTF globals')) {
        setTimeout(() => this.retryInitialization(), this.config.retryInterval);
      }
    }
  }
  
  
  async retryInitialization() {
    
    
    this.isInitialized = false;
    this.initializationError = null;
    
    
    this.cleanup();
    
    
    await this.init();
  }
  
  
  setupEventHandlers() {
    
    this.stateMonitor.on('onVolumeChanged', async (newVolume, oldVolume) => {
      try {
        await this.audioCapture.updateVolume(newVolume);
        this.sendMessage({ type: 'volumeChanged', volume: newVolume });
      } catch (err) {
        this.handleExtensionError(err);
      }
    });
    
    
    this.stateMonitor.on('onSessionStateChanged', (newState, oldState) => {
      
      if (newState === 'closed') {
        this.handleSessionClosed();
      } else if (newState === 'open' && oldState === 'closed') {
        this.handleSessionOpened();
      }
      
      this.sendMessage({
        type: 'sessionStateChanged',
        state: newState
      });
    });
    
    
    this.stateMonitor.on('onReconnect', (count) => {
      
      this.metrics.reconnects++;
      this.handleReconnect();
    });
    
    
    this.stateMonitor.on('onTalkingUsersChanged', (newUsers, oldUsers) => {
      
      
      for (const [userId] of oldUsers) {
        if (!newUsers.has(userId)) {
          this.handleUserLeft(userId);
        }
      }
    });
    
    
    this.audioCapture.on('captureStarted', (userId) => {
      
      this.metrics.capturesStarted++;
    });
    
    this.audioCapture.on('captureStopped', (userId) => {
      
    });
    
    this.audioCapture.on('captureError', (userId, error) => {
      console.error(`[VTF Extension] Audio capture error for ${userId}:`, error);
      this.metrics.capturesFailed++;
      this.handleCaptureError(userId, error);
    });
  }
  
  
  setupDOMObserver() {
    this.domObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (this.isVTFAudioElement(node)) {
            this.handleNewAudioElement(node);
          }
        });
        
        mutation.removedNodes.forEach((node) => {
          if (this.isVTFAudioElement(node)) {
            this.handleRemovedAudioElement(node);
          }
        });
      });
    });
    
    const target = document.getElementById('topRoomDiv') || document.body;
    
    this.domObserver.observe(target, {
      childList: true,
      subtree: true
    });
    
    
  }
  
  
  isVTFAudioElement(node) {
    return node.nodeType === Node.ELEMENT_NODE &&
           node.nodeName === 'AUDIO' && 
           node.id && 
           node.id.startsWith('msRemAudio-');
  }
  
  
  handleNewAudioElement(element) {
    const userId = element.id.replace('msRemAudio-', '');
    
    
    this.audioElements.set(userId, element);
    
    
    if (!this.isCapturing) {
      
      return;
    }
    
    
    if (this.pendingStreams.has(userId)) {
      
      return;
    }
    
    
    this.pendingStreams.set(userId, true);
    
    this.streamMonitor.startMonitoring(element, userId, async (stream) => {
      this.pendingStreams.delete(userId);
      await this.handleStreamAssigned(element, stream, userId);
    });
  }
  
  
  async handleStreamAssigned(element, stream, userId) {
    
    if (!stream) {
      
      return;
    }
    
    if (!this.isCapturing) {
      
      return;
    }
    
    try {
      
      await this.streamMonitor.waitForStreamReady(stream);
      
      
      await this.audioCapture.captureElement(element, stream, userId);
      
      
      this.activeCaptures.set(userId, {
        element,
        stream,
        startTime: Date.now()
      });
      
      
      const speakerName = this.getSpeakerName(userId);
      
      
      this.sendMessage({
        type: 'userJoined',
        userId,
        speakerName,
        timestamp: Date.now()
      });
      
      
    } catch (error) {
      console.error(`[VTF Extension] Failed to capture ${userId}:`, error);
      this.handleCaptureError(userId, error);
    }
  }
  
  
  handleRemovedAudioElement(element) {
    const userId = element.id.replace('msRemAudio-', '');
    
    this.handleUserLeft(userId);
  }
  
  
  handleUserLeft(userId) {
    
    if (this.pendingStreams.has(userId)) {
      this.streamMonitor.stopMonitoring(userId);
      this.pendingStreams.delete(userId);
    }
    
    
    if (this.activeCaptures.has(userId)) {
      this.audioCapture.stopCapture(userId);
      this.activeCaptures.delete(userId);
      
      const speakerName = this.getSpeakerName(userId);
      
      
      this.sendMessage({
        type: 'userLeft',
        userId,
        speakerName,
        timestamp: Date.now()
      });
    }
    
    
    this.audioElements.delete(userId);
    
    if (element.srcObject && typeof element.srcObject.getTracks === 'function') {
      for (const track of element.srcObject.getTracks()) {
        track.stop();
      }
    }
  }
  
  
  handleReconnect() {
    
    
    this.audioCapture.stopAll();
    
    
    this.activeCaptures.clear();
    this.audioElements.clear();
    this.pendingStreams.clear();
    this.streamMonitor.stopAll();
    
    
    this.sendMessage({
      type: 'reconnectAudio',
      timestamp: Date.now()
    });
    
    
    setTimeout(() => {
      if (this.isCapturing) {
        
        this.scanExistingElements();
      }
    }, 1000);
  }
  
  
  handleSessionClosed() {
    
    this.stopCapture();
  }
  
  
  handleSessionOpened() {
    
    
    if (this.config.autoStart && !this.isCapturing) {
      
      this.startCapture();
    }
  }
  
  
  handleCaptureError(userId, error) {
    this.metrics.errors++;
    
    
    this.activeCaptures.delete(userId);
    
    
    this.sendMessage({
      type: 'error',
      context: 'audioCapture',
      userId,
      error: error.message,
      timestamp: Date.now()
    });
    
    
    if (error.message.includes('suspended') && this.audioElements.has(userId)) {
      
      setTimeout(() => {
        const element = this.audioElements.get(userId);
        if (element) {
          this.handleNewAudioElement(element);
        }
      }, 2000);
    }
  }
  
  
  scanExistingElements() {
    const elements = document.querySelectorAll('audio[id^="msRemAudio-"]');
    
    elements.forEach(element => {
      this.handleNewAudioElement(element);
    });
  }
  
  
  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      
      const messageType = request.type;
      
      
      switch (messageType) {
        case 'startCapture':
          this.startCapture()
            .then(() => sendResponse({ status: 'started' }))
            .catch(error => sendResponse({ status: 'error', error: error.message }));
          return true;
          
        case 'stopCapture':
          this.stopCapture()
            .then(() => sendResponse({ status: 'stopped' }))
            .catch(error => sendResponse({ status: 'error', error: error.message }));
          return true;
          
        case 'getStatus':
          sendResponse(this.getStatus());
          return false;
          
        case 'transcription':
          this.displayTranscription(request.data);
          sendResponse({ received: true });
          return false;
          
        case 'reload':
          this.handleExtensionReload();
          sendResponse({ status: 'reloading' });
          return false;
          
        default:
          
          sendResponse({ error: 'Unknown command' });
          return false;
      }
    });
  }
  
  
  async startCapture() {
    if (!this.isInitialized) {
      throw new Error('Extension not initialized');
    }
    
    if (this.isCapturing) {
      
      return;
    }
    
    
    this.isCapturing = true;
    
    
    this.scanExistingElements();
    
    
    this.sendMessage({
      type: 'captureStarted',
      timestamp: Date.now()
    });
    
    
    this.notifyUser('VTF Audio Transcription Started', 'success');
  }
  
  
  async stopCapture() {
    if (!this.isCapturing) {
      
      return;
    }
    
    
    this.isCapturing = false;
    
    
    this.streamMonitor.stopAll();
    this.pendingStreams.clear();
    
    
    this.audioCapture.stopAll();
    this.activeCaptures.clear();
    
    
    this.sendMessage({
      type: 'captureStopped',
      timestamp: Date.now()
    });
    
    
    this.notifyUser('VTF Audio Transcription Stopped', 'info');
  }
  
  
  getStatus() {
    return {
      initialized: this.isInitialized,
      initializationError: this.initializationError,
      capturing: this.isCapturing,
      timestamp: Date.now(),
      
      
      globals: this.globalsFinder.debug(),
      streamMonitor: this.streamMonitor.debug(),
      stateMonitor: this.stateMonitor.debug(),
      audioCapture: this.audioCapture.debug(),
      
      
      activeUsers: Array.from(this.activeCaptures.entries()).map(([userId, info]) => ({
        userId,
        speaker: this.getSpeakerName(userId),
        duration: Date.now() - info.startTime
      })),
      
      
      pendingUsers: Array.from(this.pendingStreams.keys()),
      
      
      transferStats: this.audioCapture.dataTransfer?.getStats() || {},
      
      
      metrics: this.metrics
    };
  }
  
  
  displayTranscription(transcription) {
    
    
    this.ensureTranscriptionDisplay();
    
    const display = document.getElementById('vtf-transcription-display');
    if (!display) return;
    
    
    const entry = document.createElement('div');
    entry.className = 'vtf-transcript-entry';
    entry.innerHTML = `
      <div class="vtf-transcript-header">
        <span class="vtf-transcript-time">${new Date(transcription.timestamp).toLocaleTimeString()}</span>
        <span class="vtf-transcript-speaker">${transcription.speaker}</span>
      </div>
      <div class="vtf-transcript-text">${transcription.text}</div>
    `;
    
    const content = display.querySelector('.vtf-transcript-content');
    content.insertBefore(entry, content.firstChild);
    
    
    while (content.children.length > 50) {
      content.removeChild(content.lastChild);
    }
  }
  
  
  ensureTranscriptionDisplay() {
    if (document.getElementById('vtf-transcription-display')) return;
    
    const display = document.createElement('div');
    display.id = 'vtf-transcription-display';
    display.innerHTML = `
      <div class="vtf-transcript-header">
        <h3>VTF Transcriptions</h3>
        <button class="vtf-transcript-close">×</button>
      </div>
      <div class="vtf-transcript-content"></div>
    `;
    
    document.body.appendChild(display);
    
    
    const closeHandler = () => { display.remove(); };
    display.querySelector('.vtf-transcript-close').addEventListener('click', closeHandler);
    
    this._notificationElements = this._notificationElements || [];
    this._notificationHandlers = this._notificationHandlers || [];
    this._notificationElements.push(display);
    this._notificationHandlers.push({el: display.querySelector('.vtf-transcript-close'), handler: closeHandler});
  }
  
  
  notifyUser(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `vtf-extension-notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    this._notificationElements = this._notificationElements || [];
    this._notificationElements.push(notification);
    
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, this.config.notificationDuration);
  }
  
  
  getSpeakerName(userId) {
    
    const talkingUsers = this.stateMonitor.getState().talkingUsers;
    if (talkingUsers && talkingUsers.has) {
      const userData = talkingUsers.get(userId);
      if (userData?.name) return userData.name;
    }
    
    
    return `User-${userId.substring(0, 6).toUpperCase()}`;
  }
  
  
  sendMessage(message) {
    try {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          console.error('[VTF Extension] Message send error:', chrome.runtime.lastError);
          this.handleExtensionError(chrome.runtime.lastError);
        }
      });
    } catch (error) {
      console.error('[VTF Extension] Failed to send message:', error);
      this.handleExtensionError(error);
    }
  }
  
  
  handleExtensionError(error) {
    if (error.message?.includes('Extension context invalidated')) {
      this.handleExtensionReload();
    }
  }
  
  
  handleExtensionReload() {
    
    
    this.stopCapture();
    
    
    const notification = document.createElement('div');
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(244, 67, 54, 0.95);
        color: white;
        padding: 20px 30px;
        border-radius: 8px;
        font-family: -apple-system, sans-serif;
        text-align: center;
        z-index: 10002;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      ">
        <h3 style="margin: 0 0 10px 0;">VTF Extension Reloaded</h3>
        <p style="margin: 0 0 15px 0;">Please refresh the page to reconnect.</p>
        <button onclick="location.reload()" style="
          background: white;
          color: #f44336;
          border: none;
          padding: 8px 20px;
          border-radius: 4px;
          font-size: 14px;
          cursor: pointer;
          font-weight: 500;
        ">Refresh Page</button>
      </div>
    `;
    
    document.body.appendChild(notification);
  }
  
  
  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      return result.settings || {};
    } catch (error) {
      console.error('[VTF Extension] Failed to load settings:', error);
      return {};
    }
  }
  
  
  cleanup() {
    
    if (this.isCapturing) {
      this.stopCapture();
    }
    
    
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }
    
    
    this.streamMonitor.stopAll();
    this.stateMonitor.stopSync();
    
    
    this.audioElements.clear();
    this.activeCaptures.clear();
    this.pendingStreams.clear();
  }
  
  
  destroy() {
    this.cleanup();
    this.audioCapture.destroy();
    this.streamMonitor.destroy();
    this.stateMonitor.destroy();
    this.globalsFinder.destroy();
    if (this._notificationElements) {
      for (const el of this._notificationElements) {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      }
      this._notificationElements = [];
    }
    if (this._notificationHandlers) {
      for (const {el, handler} of this._notificationHandlers) {
        if (el && handler) {
          el.removeEventListener('click', handler);
        }
      }
      this._notificationHandlers = [];
    }
    this.isInitialized = false;
    console.log('[VTF Extension] Destroyed');
  }
  
  
  debug() {
    return {
      initialized: this.isInitialized,
      capturing: this.isCapturing,
      error: this.initializationError,
      modules: {
        globals: this.globalsFinder.debug(),
        stream: this.streamMonitor.debug(),
        state: this.stateMonitor.debug(),
        audio: this.audioCapture.debug()
      },
      activeCaptures: this.activeCaptures.size,
      pendingStreams: this.pendingStreams.size,
      audioElements: this.audioElements.size,
      metrics: this.metrics
    };
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

async function initializeExtension() {
  console.log('[VTF Extension] Creating extension instance...');
  // Create the extension object FIRST, before init
  window.vtfExtension = new VTFAudioExtension();
  console.log('[VTF Extension] Instance created');
  // Now try to initialize
  try {
    await window.vtfExtension.init();
    console.log('[VTF Extension] Initialization complete');
  } catch (error) {
    console.error('[VTF Extension] Failed to initialize:', error);
    // Extension object still exists for debugging even if init failed
  }
}

// Also ensure cleanup still works
window.addEventListener('beforeunload', () => {
  if (window.vtfExtension) {
    window.vtfExtension.destroy();
  }
});

export { VTFAudioExtension };