/**
 * VTF Audio Extension - Main Content Script
 * 
 * This is the primary orchestrator that integrates all refactored modules
 * and manages the extension lifecycle on VTF pages.
 * 
 * @module content
 */

import { VTFGlobalsFinder } from './modules/vtf-globals-finder.js';
import { VTFStreamMonitor } from './modules/vtf-stream-monitor.js';
import { VTFStateMonitor } from './modules/vtf-state-monitor.js';
import { VTFAudioCapture } from './modules/vtf-audio-capture.js';
import { AudioDataTransfer } from './modules/audio-data-transfer.js';

class VTFAudioExtension {
  constructor() {
    // Core components
    this.globalsFinder = new VTFGlobalsFinder();
    this.audioCapture = new VTFAudioCapture();
    this.streamMonitor = new VTFStreamMonitor();
    this.stateMonitor = new VTFStateMonitor();
    
    // State tracking
    this.audioElements = new Map();      // userId -> element
    this.activeCaptures = new Map();     // userId -> capture info
    this.pendingStreams = new Map();     // userId -> pending stream detection
    
    // Configuration
    this.config = {
      autoStart: true,                   // Auto-start on page load
      globalsTimeout: 30000,             // Max wait for VTF globals
      enableDebugLogs: false,
      retryInterval: 5000,               // Retry interval for failed operations
      notificationDuration: 5000         // How long notifications show
    };
    
    // Status
    this.isInitialized = false;
    this.isCapturing = false;
    this.initializationError = null;
    
    // DOM observer
    this.domObserver = null;
    
    // Metrics
    this.metrics = {
      capturesStarted: 0,
      capturesFailed: 0,
      reconnects: 0,
      errors: 0
    };
    
    // Legacy message type mapping
    this.legacyMessageMap = {
      'audioData': 'audioChunk',
      'start_capture': 'startCapture', 
      'stop_capture': 'stopCapture',
      'getTranscriptions': 'getStatus'
    };
  }
  
  /**
   * Initialize the extension
   */
  async init() {
    console.log('[VTF Extension] Initializing...');
    
    try {
      // Phase 1: Wait for VTF globals
      console.log('[VTF Extension] Phase 1: Waiting for VTF globals...');
      const globalsFound = await this.globalsFinder.waitForGlobals(
        Math.floor(this.config.globalsTimeout / 500),
        500
      );
      
      if (!globalsFound) {
        throw new Error('VTF globals not found after timeout');
      }
      
      console.log('[VTF Extension] VTF globals found');
      
      // Phase 2: Initialize audio subsystem
      console.log('[VTF Extension] Phase 2: Initializing audio system...');
      await this.audioCapture.initialize();
      
      // Pass globalsFinder reference to audio capture for volume access
      this.audioCapture.globalsFinder = this.globalsFinder;
      
      // Phase 3: Set up state monitoring
      console.log('[VTF Extension] Phase 3: Setting up state monitoring...');
      this.stateMonitor.startSync(this.globalsFinder, 1000);
      
      // Phase 4: Wire up event handlers
      console.log('[VTF Extension] Phase 4: Setting up event handlers...');
      this.setupEventHandlers();
      
      // Phase 5: Set up DOM monitoring
      console.log('[VTF Extension] Phase 5: Setting up DOM observer...');
      this.setupDOMObserver();
      
      // Phase 6: Process existing elements
      console.log('[VTF Extension] Phase 6: Scanning existing elements...');
      this.scanExistingElements();
      
      // Phase 7: Set up message handlers
      console.log('[VTF Extension] Phase 7: Setting up message handlers...');
      this.setupMessageHandlers();
      
      // Phase 8: Load settings and auto-start if enabled
      const settings = await this.loadSettings();
      if (settings.autoStart !== false && this.config.autoStart) {
        console.log('[VTF Extension] Phase 8: Auto-starting capture...');
        await this.startCapture();
      }
      
      this.isInitialized = true;
      console.log('[VTF Extension] Initialization complete');
      
      // Notify popup/background
      this.sendMessage({
        type: 'extensionInitialized',
        status: this.getStatus()
      });
      
    } catch (error) {
      console.error('[VTF Extension] Initialization failed:', error);
      this.initializationError = error.message;
      this.notifyUser(`VTF Extension: ${error.message}`);
      
      // Try to recover
      if (error.message.includes('VTF globals')) {
        setTimeout(() => this.retryInitialization(), this.config.retryInterval);
      }
    }
  }
  
  /**
   * Retry initialization after failure
   */
  async retryInitialization() {
    console.log('[VTF Extension] Retrying initialization...');
    
    // Reset state
    this.isInitialized = false;
    this.initializationError = null;
    
    // Clean up any partial initialization
    this.cleanup();
    
    // Try again
    await this.init();
  }
  
  /**
   * Set up event handlers for module coordination
   */
  setupEventHandlers() {
    // Volume changes from VTF
    this.stateMonitor.on('onVolumeChanged', (newVolume, oldVolume) => {
      console.log(`[VTF Extension] Volume changed: ${oldVolume} → ${newVolume}`);
      this.audioCapture.updateVolume(newVolume);
      
      // Update any UI elements
      this.sendMessage({
        type: 'volumeChanged',
        volume: newVolume
      });
    });
    
    // Session state changes
    this.stateMonitor.on('onSessionStateChanged', (newState, oldState) => {
      console.log(`[VTF Extension] Session state: ${oldState} → ${newState}`);
      
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
    
    // Reconnect events
    this.stateMonitor.on('onReconnect', (count) => {
      console.log(`[VTF Extension] VTF reconnect #${count}`);
      this.metrics.reconnects++;
      this.handleReconnect();
    });
    
    // Talking users changes
    this.stateMonitor.on('onTalkingUsersChanged', (newUsers, oldUsers) => {
      console.log(`[VTF Extension] Talking users changed: ${oldUsers.size} → ${newUsers.size}`);
      
      // Find removed users
      for (const [userId] of oldUsers) {
        if (!newUsers.has(userId)) {
          this.handleUserLeft(userId);
        }
      }
    });
    
    // Audio capture events
    this.audioCapture.on('captureStarted', (userId) => {
      console.log(`[VTF Extension] Audio capture started for ${userId}`);
      this.metrics.capturesStarted++;
    });
    
    this.audioCapture.on('captureStopped', (userId) => {
      console.log(`[VTF Extension] Audio capture stopped for ${userId}`);
    });
    
    this.audioCapture.on('captureError', (userId, error) => {
      console.error(`[VTF Extension] Audio capture error for ${userId}:`, error);
      this.metrics.capturesFailed++;
      this.handleCaptureError(userId, error);
    });
  }
  
  /**
   * Set up DOM observer for audio elements
   */
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
    
    console.log(`[VTF Extension] DOM observer started on ${target.id || 'document.body'}`);
  }
  
  /**
   * Check if a node is a VTF audio element
   */
  isVTFAudioElement(node) {
    return node.nodeType === Node.ELEMENT_NODE &&
           node.nodeName === 'AUDIO' && 
           node.id && 
           node.id.startsWith('msRemAudio-');
  }
  
  /**
   * Handle new audio element
   */
  handleNewAudioElement(element) {
    const userId = element.id.replace('msRemAudio-', '');
    console.log(`[VTF Extension] New audio element detected: ${userId}`);
    
    // Store element reference
    this.audioElements.set(userId, element);
    
    // Only process if capturing
    if (!this.isCapturing) {
      console.log(`[VTF Extension] Not capturing, skipping ${userId}`);
      return;
    }
    
    // Check if already monitoring
    if (this.pendingStreams.has(userId)) {
      console.log(`[VTF Extension] Already monitoring ${userId}`);
      return;
    }
    
    // Start monitoring for stream
    this.pendingStreams.set(userId, true);
    
    this.streamMonitor.startMonitoring(element, userId, async (stream) => {
      this.pendingStreams.delete(userId);
      await this.handleStreamAssigned(element, stream, userId);
    });
  }
  
  /**
   * Handle stream assignment
   */
  async handleStreamAssigned(element, stream, userId) {
    console.log(`[VTF Extension] Stream ${stream ? 'assigned' : 'timeout'} for ${userId}`);
    
    if (!stream) {
      console.warn(`[VTF Extension] No stream detected for ${userId}`);
      return;
    }
    
    if (!this.isCapturing) {
      console.log(`[VTF Extension] Capture stopped, not processing ${userId}`);
      return;
    }
    
    try {
      // Wait for stream to be ready
      await this.streamMonitor.waitForStreamReady(stream);
      
      // Start audio capture
      await this.audioCapture.captureElement(element, stream, userId);
      
      // Track active capture
      this.activeCaptures.set(userId, {
        element,
        stream,
        startTime: Date.now()
      });
      
      // Get speaker name
      const speakerName = this.getSpeakerName(userId);
      
      // Notify background
      this.sendMessage({
        type: 'userJoined',
        userId,
        speakerName,
        timestamp: Date.now()
      });
      
      console.log(`[VTF Extension] Audio capture active for ${speakerName} (${userId})`);
      
    } catch (error) {
      console.error(`[VTF Extension] Failed to capture ${userId}:`, error);
      this.handleCaptureError(userId, error);
    }
  }
  
  /**
   * Handle removed audio element
   */
  handleRemovedAudioElement(element) {
    const userId = element.id.replace('msRemAudio-', '');
    console.log(`[VTF Extension] Audio element removed: ${userId}`);
    
    this.handleUserLeft(userId);
  }
  
  /**
   * Handle user leaving
   */
  handleUserLeft(userId) {
    // Stop monitoring if pending
    if (this.pendingStreams.has(userId)) {
      this.streamMonitor.stopMonitoring(userId);
      this.pendingStreams.delete(userId);
    }
    
    // Stop capture if active
    if (this.activeCaptures.has(userId)) {
      this.audioCapture.stopCapture(userId);
      this.activeCaptures.delete(userId);
      
      const speakerName = this.getSpeakerName(userId);
      
      // Notify background
      this.sendMessage({
        type: 'userLeft',
        userId,
        speakerName,
        timestamp: Date.now()
      });
    }
    
    // Remove element reference
    this.audioElements.delete(userId);
  }
  
  /**
   * Handle VTF reconnect
   */
  handleReconnect() {
    console.log('[VTF Extension] Handling VTF reconnect - clearing all state');
    
    // Stop all captures
    this.audioCapture.stopAll();
    
    // Clear all state
    this.activeCaptures.clear();
    this.audioElements.clear();
    this.pendingStreams.clear();
    this.streamMonitor.stopAll();
    
    // Notify background
    this.sendMessage({
      type: 'reconnectAudio',
      timestamp: Date.now()
    });
    
    // Re-scan after delay (VTF needs time to recreate elements)
    setTimeout(() => {
      if (this.isCapturing) {
        console.log('[VTF Extension] Re-scanning after reconnect');
        this.scanExistingElements();
      }
    }, 1000);
  }
  
  /**
   * Handle session closed
   */
  handleSessionClosed() {
    console.log('[VTF Extension] Session closed - stopping capture');
    this.stopCapture();
  }
  
  /**
   * Handle session opened
   */
  handleSessionOpened() {
    console.log('[VTF Extension] Session opened');
    
    // Auto-restart if configured
    if (this.config.autoStart && !this.isCapturing) {
      console.log('[VTF Extension] Auto-restarting capture');
      this.startCapture();
    }
  }
  
  /**
   * Handle capture error
   */
  handleCaptureError(userId, error) {
    this.metrics.errors++;
    
    // Remove from active captures
    this.activeCaptures.delete(userId);
    
    // Log error
    this.sendMessage({
      type: 'error',
      context: 'audioCapture',
      userId,
      error: error.message,
      timestamp: Date.now()
    });
    
    // Retry if appropriate
    if (error.message.includes('suspended') && this.audioElements.has(userId)) {
      console.log(`[VTF Extension] Retrying capture for ${userId} in 2s`);
      setTimeout(() => {
        const element = this.audioElements.get(userId);
        if (element) {
          this.handleNewAudioElement(element);
        }
      }, 2000);
    }
  }
  
  /**
   * Scan for existing audio elements
   */
  scanExistingElements() {
    const elements = document.querySelectorAll('audio[id^="msRemAudio-"]');
    console.log(`[VTF Extension] Found ${elements.length} existing audio elements`);
    
    elements.forEach(element => {
      this.handleNewAudioElement(element);
    });
  }
  
  /**
   * Set up Chrome extension message handlers
   */
  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // Map legacy message types
      const messageType = this.legacyMessageMap[request.type] || request.type;
      
      console.log(`[VTF Extension] Received message: ${messageType}`);
      
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
          console.warn(`[VTF Extension] Unknown message type: ${request.type}`);
          sendResponse({ error: 'Unknown command' });
          return false;
      }
    });
  }
  
  /**
   * Start audio capture
   */
  async startCapture() {
    if (!this.isInitialized) {
      throw new Error('Extension not initialized');
    }
    
    if (this.isCapturing) {
      console.log('[VTF Extension] Already capturing');
      return;
    }
    
    console.log('[VTF Extension] Starting capture');
    this.isCapturing = true;
    
    // Scan for existing elements
    this.scanExistingElements();
    
    // Notify service worker
    this.sendMessage({
      type: 'captureStarted',
      timestamp: Date.now()
    });
    
    // Show notification
    this.notifyUser('VTF Audio Transcription Started', 'success');
  }
  
  /**
   * Stop audio capture
   */
  async stopCapture() {
    if (!this.isCapturing) {
      console.log('[VTF Extension] Not capturing');
      return;
    }
    
    console.log('[VTF Extension] Stopping capture');
    this.isCapturing = false;
    
    // Stop all monitoring
    this.streamMonitor.stopAll();
    this.pendingStreams.clear();
    
    // Stop all audio captures
    this.audioCapture.stopAll();
    this.activeCaptures.clear();
    
    // Notify service worker
    this.sendMessage({
      type: 'captureStopped',
      timestamp: Date.now()
    });
    
    // Show notification
    this.notifyUser('VTF Audio Transcription Stopped', 'info');
  }
  
  /**
   * Get current status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      initializationError: this.initializationError,
      capturing: this.isCapturing,
      timestamp: Date.now(),
      
      // Module states
      globals: this.globalsFinder.debug(),
      streamMonitor: this.streamMonitor.debug(),
      stateMonitor: this.stateMonitor.debug(),
      audioCapture: this.audioCapture.debug(),
      
      // Active captures
      activeUsers: Array.from(this.activeCaptures.entries()).map(([userId, info]) => ({
        userId,
        speaker: this.getSpeakerName(userId),
        duration: Date.now() - info.startTime
      })),
      
      // Pending streams
      pendingUsers: Array.from(this.pendingStreams.keys()),
      
      // Transfer stats
      transferStats: this.audioCapture.dataTransfer?.getStats() || {},
      
      // Metrics
      metrics: this.metrics
    };
  }
  
  /**
   * Display transcription in UI
   */
  displayTranscription(transcription) {
    console.log(`[VTF Extension] Displaying transcription from ${transcription.speaker}`);
    
    // Create or update transcription display
    this.ensureTranscriptionDisplay();
    
    const display = document.getElementById('vtf-transcription-display');
    if (!display) return;
    
    // Add transcription entry
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
    
    // Keep only last 50 entries
    while (content.children.length > 50) {
      content.removeChild(content.lastChild);
    }
  }
  
  /**
   * Ensure transcription display exists
   */
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
    
    // Close button handler
    display.querySelector('.vtf-transcript-close').addEventListener('click', () => {
      display.remove();
    });
  }
  
  /**
   * Show user notification
   */
  notifyUser(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `vtf-extension-notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, this.config.notificationDuration);
  }
  
  /**
   * Get speaker name for userId
   */
  getSpeakerName(userId) {
    // Check if we have a mapping from state monitor
    const talkingUsers = this.stateMonitor.getState().talkingUsers;
    if (talkingUsers && talkingUsers.has) {
      const userData = talkingUsers.get(userId);
      if (userData?.name) return userData.name;
    }
    
    // Use shortened ID as fallback
    return `User-${userId.substring(0, 6).toUpperCase()}`;
  }
  
  /**
   * Send message to service worker
   */
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
  
  /**
   * Handle extension errors
   */
  handleExtensionError(error) {
    if (error.message?.includes('Extension context invalidated')) {
      this.handleExtensionReload();
    }
  }
  
  /**
   * Handle extension reload
   */
  handleExtensionReload() {
    console.log('[VTF Extension] Extension reloaded, showing notification');
    
    // Stop everything
    this.stopCapture();
    
    // Show reload notification
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
  
  /**
   * Load settings from storage
   */
  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      return result.settings || {};
    } catch (error) {
      console.error('[VTF Extension] Failed to load settings:', error);
      return {};
    }
  }
  
  /**
   * Clean up partial initialization
   */
  cleanup() {
    // Stop any active operations
    if (this.isCapturing) {
      this.stopCapture();
    }
    
    // Disconnect observer
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }
    
    // Stop monitoring
    this.streamMonitor.stopAll();
    this.stateMonitor.stopSync();
    
    // Clear maps
    this.audioElements.clear();
    this.activeCaptures.clear();
    this.pendingStreams.clear();
  }
  
  /**
   * Destroy the extension
   */
  destroy() {
    console.log('[VTF Extension] Destroying extension instance');
    
    // Stop everything
    this.cleanup();
    
    // Destroy all modules
    this.audioCapture.destroy();
    this.streamMonitor.destroy();
    this.stateMonitor.destroy();
    this.globalsFinder.destroy();
    
    // Clear references
    this.isInitialized = false;
  }
  
  /**
   * Get debug information
   */
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

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

async function initializeExtension() {
  console.log('[VTF Extension] DOM ready, starting initialization');
  
  // Create global instance for debugging
  window.vtfExtension = new VTFAudioExtension();
  
  try {
    await window.vtfExtension.init();
  } catch (error) {
    console.error('[VTF Extension] Failed to initialize:', error);
  }
}

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (window.vtfExtension) {
    window.vtfExtension.destroy();
  }
});

// Export for testing
export { VTFAudioExtension };