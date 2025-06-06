/**
 * VTF Extension Popup - Fully integrated with refactored architecture
 * 
 * Works with the new modular system:
 * - content.js (VTFAudioExtension)
 * - background.js (VTFTranscriptionService)
 * - All the new modules (VTFGlobalsFinder, VTFAudioCapture, etc.)
 */

class VTFPopup {
  constructor() {
    // State
    this.extensionStatus = {
      initialized: false,
      capturing: false,
      hasApiKey: false,
      onVTFPage: false,
      activeUsers: new Map(),
      stats: {}
    };
    
    // UI elements
    this.elements = {};
    
    // Update intervals
    this.statusInterval = null;
    this.transcriptionInterval = null;
    
    // Message queue for resilience
    this.pendingMessages = [];
    
    // Initialize
    this.init();
  }
  
  async init() {
    console.log('[VTF Popup] Initializing...');
    
    // Cache DOM elements
    this.cacheElements();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Check initial state
    await this.checkExtensionState();
    
    // Start monitoring
    this.startMonitoring();
    
    console.log('[VTF Popup] Initialization complete');
  }
  
  cacheElements() {
    this.elements = {
      // Status indicator
      statusIndicator: document.getElementById('statusIndicator'),
      
      // Controls
      startBtn: document.getElementById('startBtn'),
      btnText: document.getElementById('btnText'),
      recordingDot: document.getElementById('recordingDot'),
      refreshBtn: document.getElementById('refreshBtn'),
      optionsBtn: document.getElementById('optionsBtn'),
      
      // Extension state
      extensionState: document.getElementById('extensionState'),
      stateMessage: document.getElementById('stateMessage'),
      
      // Status grid
      extensionStatus: document.getElementById('extensionStatus'),
      apiKeyStatus: document.getElementById('apiKeyStatus'),
      activeUsers: document.getElementById('activeUsers'),
      transcriptionCount: document.getElementById('transcriptionCount'),
      
      // Speakers section
      activeSpeakers: document.getElementById('activeSpeakers'),
      speakersGrid: document.getElementById('speakersGrid'),
      
      // Transcriptions
      transcriptList: document.getElementById('transcriptList')
    };
  }
  
  setupEventListeners() {
    // Start/Stop button
    this.elements.startBtn.addEventListener('click', () => this.toggleCapture());
    
    // Refresh button
    this.elements.refreshBtn.addEventListener('click', () => this.refresh());
    
    // Options button
    this.elements.optionsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
    
    // Listen for real-time updates from content/background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleRealtimeUpdate(message);
    });
  }
  
  async checkExtensionState() {
    try {
      // Check if we're on VTF
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.extensionStatus.onVTFPage = tab?.url?.includes('vtf.t3live.com') || false;
      
      if (!this.extensionStatus.onVTFPage) {
        this.showExtensionState('Please navigate to VTF (vtf.t3live.com)', 'warning');
        this.disableControls();
        return;
      }
      
      // Check API key
      const storage = await chrome.storage.local.get(['openaiApiKey']);
      this.extensionStatus.hasApiKey = !!storage.openaiApiKey;
      
      // Get extension status from content script
      const contentStatus = await this.sendToContent({ type: 'getStatus' });
      console.log('[VTF Popup] Content script status:', contentStatus);
      
      if (contentStatus && contentStatus.initialized) {
        this.extensionStatus.initialized = true;
        this.extensionStatus.capturing = contentStatus.capturing;
        this.updateUIFromContentStatus(contentStatus);
      } else {
        this.showExtensionState('Extension is initializing on VTF page...', 'info');
      }
      
      // Get service worker status
      const serviceStatus = await this.sendToBackground({ type: 'getStatus' });
      console.log('[VTF Popup] Service worker status:', serviceStatus);
      
      if (serviceStatus) {
        this.updateUIFromServiceStatus(serviceStatus);
      }
      
    } catch (error) {
      console.error('[VTF Popup] State check error:', error);
      this.showExtensionState('Extension error. Try refreshing the page.', 'error');
    }
  }
  
  updateUIFromContentStatus(status) {
    // Extension initialized
    if (status.initialized) {
      this.elements.extensionStatus.textContent = 'Ready';
      this.elements.extensionStatus.className = 'status-value success';
      this.hideExtensionState();
      this.enableControls();
    } else {
      this.elements.extensionStatus.textContent = 'Initializing';
      this.elements.extensionStatus.className = 'status-value warning';
    }
    
    // Capture state
    this.updateCaptureState(status.capturing);
    
    // Active users from content script
    if (status.activeUsers && Array.isArray(status.activeUsers)) {
      this.updateActiveUsers(status.activeUsers);
    }
  }
  
  updateUIFromServiceStatus(status) {
    // API key status
    if (status.hasApiKey) {
      this.elements.apiKeyStatus.textContent = 'Configured';
      this.elements.apiKeyStatus.className = 'status-value success';
      this.extensionStatus.hasApiKey = true;
    } else {
      this.elements.apiKeyStatus.textContent = 'Not Set';
      this.elements.apiKeyStatus.className = 'status-value danger';
      this.extensionStatus.hasApiKey = false;
      this.elements.startBtn.disabled = true;
    }
    
    // Stats
    if (status.stats) {
      this.elements.transcriptionCount.textContent = status.stats.transcriptionsSent || '0';
    }
    
    // Active buffers
    if (status.buffers && Array.isArray(status.buffers)) {
      this.updateBufferDisplay(status.buffers);
    }
  }
  
  updateCaptureState(isCapturing) {
    this.extensionStatus.capturing = isCapturing;
    
    if (isCapturing) {
      this.elements.startBtn.classList.add('capturing');
      this.elements.btnText.textContent = 'Stop Capture';
      this.elements.recordingDot.classList.remove('hidden');
      this.elements.statusIndicator.classList.add('active');
    } else {
      this.elements.startBtn.classList.remove('capturing');
      this.elements.btnText.textContent = 'Start Capture';
      this.elements.recordingDot.classList.add('hidden');
      this.elements.statusIndicator.classList.remove('active');
    }
  }
  
  updateActiveUsers(users) {
    const count = users.length;
    this.elements.activeUsers.textContent = count.toString();
    
    if (count > 0) {
      // Build speaker cards
      const html = users.map(user => {
        const initials = this.getInitials(user.speaker);
        return `
          <div class="speaker-card">
            <div class="speaker-avatar">${initials}</div>
            <div class="speaker-info">
              <div class="speaker-name">${this.escapeHtml(user.speaker)}</div>
              <div class="speaker-stats">${this.formatDuration(user.duration)}</div>
            </div>
            <div class="speaker-buffer"></div>
          </div>
        `;
      }).join('');
      
      this.elements.speakersGrid.innerHTML = html;
      this.elements.activeSpeakers.classList.remove('hidden');
    } else {
      this.elements.activeSpeakers.classList.add('hidden');
    }
  }
  
  updateBufferDisplay(buffers) {
    // Update active user count from buffers
    const activeBuffers = buffers.filter(b => b.duration > 0);
    
    if (activeBuffers.length > 0 && this.extensionStatus.capturing) {
      // Merge with content script data if available
      const speakerMap = new Map();
      
      activeBuffers.forEach(buffer => {
        speakerMap.set(buffer.userId, {
          speaker: buffer.speaker,
          duration: buffer.duration,
          samples: buffer.samples
        });
      });
      
      // Update display
      const users = Array.from(speakerMap.values());
      this.updateActiveUsers(users);
    }
  }
  
  async toggleCapture() {
    if (!this.extensionStatus.initialized || !this.extensionStatus.hasApiKey) {
      this.showToast('Extension not ready', 'error');
      return;
    }
    
    // Disable button during operation
    this.elements.startBtn.disabled = true;
    
    try {
      const action = this.extensionStatus.capturing ? 'stopCapture' : 'startCapture';
      
      // Send to content script
      const contentResponse = await this.sendToContent({ type: action });
      console.log('[VTF Popup] Content response:', contentResponse);
      
      // Update UI immediately
      this.updateCaptureState(!this.extensionStatus.capturing);
      
      // Show feedback
      const message = this.extensionStatus.capturing ? 'Capture started' : 'Capture stopped';
      this.showToast(message, 'success');
      
    } catch (error) {
      console.error('[VTF Popup] Toggle capture error:', error);
      this.showToast('Failed to toggle capture', 'error');
    } finally {
      // Re-enable button
      setTimeout(() => {
        this.elements.startBtn.disabled = false;
      }, 500);
    }
  }
  
  async refresh() {
    console.log('[VTF Popup] Refreshing status...');
    
    // Visual feedback
    this.elements.refreshBtn.style.transform = 'rotate(360deg)';
    
    await this.checkExtensionState();
    await this.loadTranscriptions();
    
    setTimeout(() => {
      this.elements.refreshBtn.style.transform = '';
    }, 300);
    
    this.showToast('Status refreshed', 'success');
  }
  
  startMonitoring() {
    // Status updates - faster when capturing
    const updateStatus = () => {
      const interval = this.extensionStatus.capturing ? 1000 : 3000;
      
      this.statusInterval = setTimeout(async () => {
        if (document.visibilityState === 'visible') {
          await this.checkExtensionState();
        }
        updateStatus();
      }, interval);
    };
    updateStatus();
    
    // Transcription updates
    const updateTranscriptions = () => {
      this.transcriptionInterval = setTimeout(async () => {
        if (document.visibilityState === 'visible' && this.extensionStatus.capturing) {
          await this.loadTranscriptions();
        }
        updateTranscriptions();
      }, 2000);
    };
    updateTranscriptions();
    
    // Initial transcription load
    this.loadTranscriptions();
  }
  
  async loadTranscriptions() {
    try {
      const response = await this.sendToBackground({ type: 'getTranscriptions' });
      
      if (response && response.transcriptions) {
        this.displayTranscriptions(response.transcriptions);
      }
    } catch (error) {
      console.error('[VTF Popup] Failed to load transcriptions:', error);
    }
  }
  
  displayTranscriptions(transcriptions) {
    if (!transcriptions || transcriptions.length === 0) {
      this.elements.transcriptList.innerHTML = 
        '<div class="empty-state">No transcriptions yet. Click Start Capture to begin.</div>';
      return;
    }
    
    // Show most recent 15
    const recent = transcriptions.slice(-15).reverse();
    
    const html = recent.map(trans => {
      const time = new Date(trans.timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
      });
      
      return `
        <div class="transcript-entry">
          <div class="transcript-meta">
            <span class="transcript-speaker">${this.escapeHtml(trans.speaker)}</span>
            <span class="transcript-time">${time}</span>
          </div>
          <div class="transcript-text">${this.escapeHtml(trans.text)}</div>
        </div>
      `;
    }).join('');
    
    this.elements.transcriptList.innerHTML = html;
  }
  
  handleRealtimeUpdate(message) {
    console.log('[VTF Popup] Realtime update:', message.type);
    
    switch (message.type) {
      case 'transcription':
        // New transcription arrived - reload list
        this.loadTranscriptions();
        break;
        
      case 'captureStarted':
      case 'captureStopped':
        // State changed - update UI
        this.checkExtensionState();
        break;
        
      case 'bufferStatus':
        // Update buffer display
        if (message.data && message.data.buffers) {
          this.updateBufferDisplay(message.data.buffers);
        }
        break;
        
      case 'extensionInitialized':
        // Extension just initialized
        this.checkExtensionState();
        this.showToast('Extension ready', 'success');
        break;
    }
  }
  
  async sendToContent(message) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.id) {
        throw new Error('No active tab');
      }
      
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, message, response => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    } catch (error) {
      console.error('[VTF Popup] Content script communication error:', error);
      return null;
    }
  }
  
  async sendToBackground(message) {
    try {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, response => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    } catch (error) {
      console.error('[VTF Popup] Background communication error:', error);
      return null;
    }
  }
  
  showExtensionState(message, type = 'info') {
    this.elements.stateMessage.textContent = message;
    this.elements.extensionState.classList.remove('hidden');
    
    // Update color based on type
    this.elements.extensionState.style.background = 
      type === 'error' ? '#fee' : 
      type === 'warning' ? '#fff3cd' : 
      '#e3f2fd';
  }
  
  hideExtensionState() {
    this.elements.extensionState.classList.add('hidden');
  }
  
  showToast(message, type = 'info') {
    // Remove any existing toast
    const existing = document.querySelector('.message-toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `message-toast ${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
  
  enableControls() {
    this.elements.startBtn.disabled = !this.extensionStatus.hasApiKey;
    this.elements.refreshBtn.disabled = false;
  }
  
  disableControls() {
    this.elements.startBtn.disabled = true;
    this.elements.refreshBtn.disabled = true;
  }
  
  getInitials(name) {
    const parts = name.split(/[\s-]+/);
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  
  formatDuration(seconds) {
    if (typeof seconds !== 'number') return 'Active';
    
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s buffered`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toFixed(0).padStart(2, '0')} buffered`;
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
  
  destroy() {
    if (this.statusInterval) clearTimeout(this.statusInterval);
    if (this.transcriptionInterval) clearTimeout(this.transcriptionInterval);
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('[VTF Popup] DOM loaded, creating popup instance');
  window.vtfPopup = new VTFPopup();
});

// Cleanup on unload
window.addEventListener('unload', () => {
  if (window.vtfPopup) {
    window.vtfPopup.destroy();
  }
});