class VTFPopup {
  constructor() {
    // Extension status tracking
    this.extensionStatus = {
      initialized: false,
      initPhase: 'pending',
      capturing: false,
      hasApiKey: false,
      onVTFPage: false,
      activeUsers: new Map(),
      stats: {},
      lastError: null
    };
    
    // UI elements cache
    this.elements = {};
    
    // Update intervals
    this.statusInterval = null;
    this.transcriptionInterval = null;
    
    // Message queue for delayed operations
    this.pendingMessages = [];
    
    // Initialize
    this.init();
  }
  
  async init() {
    console.log('[VTF Popup] Initializing...');
    
    this.cacheElements();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Check extension state
    await this.checkExtensionState();
    
    // Start monitoring
    this.startMonitoring();
    
    console.log('[VTF Popup] Initialization complete');
  }
  
  cacheElements() {
    // Status elements
    this.elements.extensionState = document.getElementById('extensionState');
    this.elements.extensionStatus = document.getElementById('extensionStatus');
    this.elements.apiKeyStatus = document.getElementById('apiKeyStatus');
    this.elements.captureStatus = document.getElementById('captureStatus');
    
    // Controls
    this.elements.startBtn = document.getElementById('startCapture');
    this.elements.stopBtn = document.getElementById('stopCapture');
    this.elements.settingsBtn = document.getElementById('settingsBtn');
    
    // Stats
    this.elements.activeUsers = document.getElementById('activeUsers');
    this.elements.audioChunks = document.getElementById('audioChunks');
    this.elements.transcriptions = document.getElementById('transcriptions');
    
    // Sections
    this.elements.activeSpeakers = document.getElementById('activeSpeakers');
    this.elements.speakersGrid = document.getElementById('speakersGrid');
    this.elements.recentTranscriptions = document.getElementById('recentTranscriptions');
    this.elements.transcriptionsList = document.getElementById('transcriptionsList');
  }
  
  setupEventListeners() {
    // Control buttons
    this.elements.startBtn.addEventListener('click', () => this.startCapture());
    this.elements.stopBtn.addEventListener('click', () => this.stopCapture());
    this.elements.settingsBtn.addEventListener('click', () => this.openSettings());
    
    // Listen for extension messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleExtensionMessage(message);
    });
  }
  
  async checkExtensionState() {
    try {
      console.log('[VTF Popup] Checking extension state...');
      
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
      
      // Get content script status
      const contentStatus = await this.sendToContent({ type: 'getStatus' });
      
      if (contentStatus) {
        this.updateFromContentStatus(contentStatus);
      } else {
        this.showExtensionState('Extension is initializing on VTF page...', 'info');
      }
      
      // Get service status
      const serviceStatus = await this.sendToBackground({ type: 'getStatus' });
      
      if (serviceStatus) {
        this.updateUIFromServiceStatus(serviceStatus);
      }
      
    } catch (error) {
      console.error('[VTF Popup] State check error:', error);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      console.error('[VTF Popup] Error details:', { 
        message: errorMessage,
        stack: error?.stack,
        type: error?.name 
      });
      this.showExtensionState(`Extension error: ${errorMessage}`, 'error');
    }
  }
  
  updateFromContentStatus(status) {
    console.log('[VTF Popup] Updating from content status:', status);
    
    // Handle bridge state
    if (status.bridge) {
      this.extensionStatus.initialized = status.bridge.initialized;
      this.extensionStatus.initPhase = status.bridge.initPhase;
      this.extensionStatus.capturing = status.bridge.capturing;
      this.extensionStatus.lastError = status.bridge.lastError;
      
      // Update UI based on initialization phase
      this.updateInitializationUI(status.bridge);
      
      // Update capture state if initialized
      if (status.bridge.initialized && status.bridge.initPhase === 'ready') {
        this.updateCaptureState(status.bridge.capturing);
      }
    }
    
    // Handle inject state
    if (status.inject) {
      // Update active users from inject state
      if (status.inject.activeCaptures && Array.isArray(status.inject.activeCaptures)) {
        this.updateActiveUsers(status.inject.activeCaptures.map(userId => ({
          userId,
          speaker: this.getSpeakerName(userId),
          duration: 0
        })));
      }
      
      // Show detailed state if available
      if (status.inject.details) {
        console.log('[VTF Popup] Inject details:', status.inject.details);
      }
    }
  }
  
  updateInitializationUI(bridgeState) {
    const phase = bridgeState.initPhase;
    const progress = bridgeState.initProgress;
    
    // Map phases to user-friendly messages
    const phaseMessages = {
      'pending': 'Starting initialization...',
      'discovering_globals': 'Finding VTF components...',
      'setting_up_observers': 'Setting up audio monitoring...',
      'applying_hooks': 'Connecting to VTF functions...',
      'ready': 'Ready',
      'failed': 'Initialization failed'
    };
    
    const message = phaseMessages[phase] || phase;
    
    if (phase === 'ready') {
      this.elements.extensionStatus.textContent = 'Ready';
      this.elements.extensionStatus.className = 'status-value success';
      this.hideExtensionState();
      this.enableControls();
    } else if (phase === 'failed') {
      this.elements.extensionStatus.textContent = 'Failed';
      this.elements.extensionStatus.className = 'status-value error';
      const error = bridgeState.lastError?.error || bridgeState.lastError || 'Unknown error';
      this.showExtensionState(`Initialization failed: ${error}`, 'error');
      this.disableControls();
    } else {
      this.elements.extensionStatus.textContent = 'Initializing';
      this.elements.extensionStatus.className = 'status-value warning';
      this.showExtensionState(progress || message, 'info');
      this.disableControls();
    }
    
    // Update specific component statuses if available
    if (bridgeState.globalsFound !== undefined) {
      const globalsStatus = bridgeState.globalsFound ? '✓' : '✗';
      console.log(`[VTF Popup] Globals found: ${globalsStatus}`);
    }
    
    if (bridgeState.observerSetup !== undefined) {
      const observerStatus = bridgeState.observerSetup ? '✓' : '✗';
      console.log(`[VTF Popup] Observer setup: ${observerStatus}`);
    }
    
    if (bridgeState.hooksApplied !== undefined) {
      const hooksStatus = bridgeState.hooksApplied ? '✓' : '✗';
      console.log(`[VTF Popup] Hooks applied: ${hooksStatus}`);
    }
  }
  
  updateUIFromServiceStatus(status) {
    // Update stats
    if (status.stats) {
      this.elements.audioChunks.textContent = status.stats.chunksReceived || '0';
      this.elements.transcriptions.textContent = status.stats.transcriptionsSent || '0';
    }
    
    // Update API key status
    if (status.hasApiKey !== undefined) {
      this.extensionStatus.hasApiKey = status.hasApiKey;
      this.elements.apiKeyStatus.textContent = status.hasApiKey ? 'Configured' : 'Not Set';
      this.elements.apiKeyStatus.className = status.hasApiKey ? 'status-value success' : 'status-value error';
      
      if (!status.hasApiKey) {
        this.showExtensionState('Please configure your OpenAI API key in settings', 'warning');
      }
    }
    
    // Update active users
    if (status.activeUsers) {
      this.updateActiveUsers(status.activeUsers);
    }
  }
  
  updateActiveUsers(users) {
    const count = users.length;
    this.elements.activeUsers.textContent = count.toString();
    
    if (count > 0) {
      // Update speaker cards
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
  
  handleExtensionMessage(message) {
    console.log('[VTF Popup] Received message:', message.type);
    
    switch (message.type) {
      case 'initProgress':
        // Update initialization progress
        this.extensionStatus.initPhase = message.phase;
        this.updateInitializationUI({
          initPhase: message.phase,
          initProgress: message.message
        });
        break;
        
      case 'transcription':
        // Add to transcription list
        this.addTranscription(message.data);
        break;
        
      case 'statusUpdate':
        // Update status
        if (message.status) {
          this.updateFromContentStatus(message.status);
        }
        break;
        
      case 'error':
        // Show error
        this.showExtensionState(`Error: ${message.error}`, 'error');
        break;
    }
  }
  
  showExtensionState(message, type = 'info') {
    this.elements.extensionState.textContent = message;
    this.elements.extensionState.className = `extension-state ${type}`;
    this.elements.extensionState.style.display = 'block';
  }
  
  hideExtensionState() {
    this.elements.extensionState.style.display = 'none';
  }
  
  updateCaptureState(capturing) {
    this.extensionStatus.capturing = capturing;
    this.elements.captureStatus.textContent = capturing ? 'Active' : 'Stopped';
    this.elements.captureStatus.className = capturing ? 'status-value success' : 'status-value';
    
    // Update button states
    this.elements.startBtn.disabled = capturing;
    this.elements.stopBtn.disabled = !capturing;
    
    if (capturing) {
      this.elements.startBtn.classList.add('disabled');
      this.elements.stopBtn.classList.remove('disabled');
    } else {
      this.elements.startBtn.classList.remove('disabled');
      this.elements.stopBtn.classList.add('disabled');
    }
  }
  
  enableControls() {
    this.elements.startBtn.disabled = this.extensionStatus.capturing;
    this.elements.stopBtn.disabled = !this.extensionStatus.capturing;
  }
  
  disableControls() {
    this.elements.startBtn.disabled = true;
    this.elements.stopBtn.disabled = true;
    this.elements.startBtn.classList.add('disabled');
    this.elements.stopBtn.classList.add('disabled');
  }
  
  async startCapture() {
    if (!this.extensionStatus.hasApiKey) {
      this.showExtensionState('Please configure your API key first', 'warning');
      return;
    }
    
    try {
      // Send to content script
      await this.sendToContent({ type: 'startCapture' });
      
      // Send to background
      await this.sendToBackground({ type: 'startCapture' });
      
      this.updateCaptureState(true);
      this.showExtensionState('Audio capture started', 'success');
      setTimeout(() => this.hideExtensionState(), 3000);
      
    } catch (error) {
      console.error('[VTF Popup] Start capture error:', error);
      this.showExtensionState('Failed to start capture', 'error');
    }
  }
  
  async stopCapture() {
    try {
      // Send to content script
      await this.sendToContent({ type: 'stopCapture' });
      
      // Send to background
      await this.sendToBackground({ type: 'stopCapture' });
      
      this.updateCaptureState(false);
      this.showExtensionState('Audio capture stopped', 'info');
      setTimeout(() => this.hideExtensionState(), 3000);
      
    } catch (error) {
      console.error('[VTF Popup] Stop capture error:', error);
      this.showExtensionState('Failed to stop capture', 'error');
    }
  }
  
  openSettings() {
    chrome.runtime.openOptionsPage();
  }
  
  startMonitoring() {
    // Status monitoring
    this.statusInterval = setInterval(async () => {
      if (this.extensionStatus.onVTFPage && this.extensionStatus.initialized) {
        try {
          const status = await this.sendToContent({ type: 'getStatus' });
          if (status) {
            this.updateFromContentStatus(status);
          }
        } catch (error) {
          // Silent fail - might be reconnecting
          console.debug('[VTF Popup] Status check failed:', error);
        }
      }
    }, 2000);
    
    // Transcription monitoring
    this.transcriptionInterval = setInterval(async () => {
      if (this.extensionStatus.capturing) {
        try {
          const response = await this.sendToBackground({ type: 'getTranscriptions' });
          if (response?.transcriptions) {
            this.updateTranscriptions(response.transcriptions);
          }
        } catch (error) {
          console.error('[VTF Popup] Transcription fetch error:', error);
        }
      }
    }, 5000);
  }
  
  async sendToContent(message) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.id) {
        throw new Error('No active tab');
      }
      
      // Check if we're on the correct domain
      if (!tab.url?.includes('vtf.t3live.com')) {
        throw new Error('Not on VTF page');
      }
      
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, message, response => {
          if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError;
            console.error('[VTF Popup] Chrome runtime error:', error);
            
            // Check if content script is not loaded
            if (error.message?.includes('Could not establish connection') || 
                error.message?.includes('Receiving end does not exist')) {
              reject(new Error('Content script not loaded. Please refresh the VTF page.'));
            } else {
              reject(error);
            }
          } else {
            resolve(response);
          }
        });
      });
    } catch (error) {
      console.error('[VTF Popup] Content script communication error:', error);
      throw error; // Re-throw to be caught by caller
    }
  }
  
  async sendToBackground(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }
  
  addTranscription(transcription) {
    const html = `
      <div class="transcription-item">
        <div class="transcription-header">
          <span class="speaker-name">${this.escapeHtml(transcription.speaker)}</span>
          <span class="timestamp">${new Date(transcription.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="transcription-text">${this.escapeHtml(transcription.text)}</div>
      </div>
    `;
    
    // Add to top of list
    this.elements.transcriptionsList.insertAdjacentHTML('afterbegin', html);
    
    // Show section
    this.elements.recentTranscriptions.classList.remove('hidden');
    
    // Limit to 10 items
    const items = this.elements.transcriptionsList.querySelectorAll('.transcription-item');
    if (items.length > 10) {
      items[items.length - 1].remove();
    }
  }
  
  updateTranscriptions(transcriptions) {
    // Get last 10 transcriptions
    const recent = transcriptions.slice(-10).reverse();
    
    if (recent.length === 0) {
      this.elements.recentTranscriptions.classList.add('hidden');
      return;
    }
    
    const html = recent.map(t => `
      <div class="transcription-item">
        <div class="transcription-header">
          <span class="speaker-name">${this.escapeHtml(t.speaker)}</span>
          <span class="timestamp">${new Date(t.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="transcription-text">${this.escapeHtml(t.text)}</div>
      </div>
    `).join('');
    
    this.elements.transcriptionsList.innerHTML = html;
    this.elements.recentTranscriptions.classList.remove('hidden');
  }
  
  getSpeakerName(userId) {
    // Map userId to speaker name
    const speakerMap = {
      'XRcupJu26dK_sazaAAPK': 'DP',
      'Ixslfo7890K_bazaAAPK': 'Rickman',
      'O3e0pz1234K_cazaAAPK': 'Kira'
    };
    
    return speakerMap[userId] || `User ${userId.substring(0, 6)}`;
  }
  
  getInitials(name) {
    const parts = name.split(/[\s-]+/);
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  
  formatDuration(seconds) {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new VTFPopup();
});

window.addEventListener('unload', () => {
  if (window.vtfPopup) {
    window.vtfPopup.destroy();
  }
});