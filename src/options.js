/**
 * VTF Extension Options - Fully integrated with refactored architecture
 * 
 * Works with the new service worker (VTFTranscriptionService) and provides
 * comprehensive configuration options for the extension.
 */

class VTFOptions {
  constructor() {
    // Settings state
    this.settings = {};
    this.speakerMappings = new Map();
    this.autoLearnEnabled = false;
    
    // Initialize
    this.initializeElements();
    this.initializeEventListeners();
    this.loadSettings();
    this.loadStatistics();
  }
  
  initializeElements() {
    // API Configuration
    this.elements = {
      // API settings
      apiKey: document.getElementById('apiKey'),
      toggleApiKey: document.getElementById('toggleApiKey'),
      apiEndpoint: document.getElementById('apiEndpoint'),
      saveApiBtn: document.getElementById('saveApiBtn'),
      
      // Speaker mappings
      speakerMappings: document.getElementById('speakerMappings'),
      addSpeakerBtn: document.getElementById('addSpeakerBtn'),
      importSpeakersBtn: document.getElementById('importSpeakersBtn'),
      exportSpeakersBtn: document.getElementById('exportSpeakersBtn'),
      autoLearnToggle: document.getElementById('autoLearnToggle'),
      autoLearnStatus: document.getElementById('autoLearnStatus'),
      
      // Capture settings
      autoStart: document.getElementById('autoStart'),
      bufferDuration: document.getElementById('bufferDuration'),
      bufferDurationValue: document.getElementById('bufferDurationValue'),
      silenceThreshold: document.getElementById('silenceThreshold'),
      silenceTimeout: document.getElementById('silenceTimeout'),
      saveCaptureBtn: document.getElementById('saveCaptureBtn'),
      
      // Advanced settings
      debugMode: document.getElementById('debugMode'),
      performanceMode: document.getElementById('performanceMode'),
      maxTranscriptions: document.getElementById('maxTranscriptions'),
      maxRetries: document.getElementById('maxRetries'),
      saveAdvancedBtn: document.getElementById('saveAdvancedBtn'),
      
      // Data management
      exportDataBtn: document.getElementById('exportDataBtn'),
      importDataBtn: document.getElementById('importDataBtn'),
      clearTranscriptionsBtn: document.getElementById('clearTranscriptionsBtn'),
      resetSettingsBtn: document.getElementById('resetSettingsBtn'),
      importFileInput: document.getElementById('importFileInput'),
      
      // Stats
      totalTranscriptions: document.getElementById('totalTranscriptions'),
      storageUsed: document.getElementById('storageUsed'),
      knownSpeakers: document.getElementById('knownSpeakers'),
      serviceUptime: document.getElementById('serviceUptime'),
      
      // Messages
      successMessage: document.getElementById('successMessage'),
      errorMessage: document.getElementById('errorMessage'),
      
      // Modal
      addSpeakerModal: document.getElementById('addSpeakerModal'),
      newUserId: document.getElementById('newUserId'),
      newSpeakerName: document.getElementById('newSpeakerName'),
      confirmAddSpeaker: document.getElementById('confirmAddSpeaker')
    };
  }
  
  initializeEventListeners() {
    // API settings
    this.elements.toggleApiKey.addEventListener('click', () => this.toggleApiKeyVisibility());
    this.elements.saveApiBtn.addEventListener('click', () => this.saveApiSettings());
    
    // Speaker mappings
    this.elements.addSpeakerBtn.addEventListener('click', () => this.showAddSpeakerModal());
    this.elements.confirmAddSpeaker.addEventListener('click', () => this.addSpeaker());
    this.elements.importSpeakersBtn.addEventListener('click', () => this.importSpeakers());
    this.elements.exportSpeakersBtn.addEventListener('click', () => this.exportSpeakers());
    this.elements.autoLearnToggle.addEventListener('click', () => this.toggleAutoLearn());
    
    // Capture settings
    this.elements.bufferDuration.addEventListener('input', (e) => {
      this.elements.bufferDurationValue.textContent = `${e.target.value}s`;
    });
    this.elements.saveCaptureBtn.addEventListener('click', () => this.saveCaptureSettings());
    
    // Advanced settings
    this.elements.saveAdvancedBtn.addEventListener('click', () => this.saveAdvancedSettings());
    
    // Data management
    this.elements.exportDataBtn.addEventListener('click', () => this.exportAllData());
    this.elements.importDataBtn.addEventListener('click', () => {
      this.elements.importFileInput.click();
    });
    this.elements.importFileInput.addEventListener('change', (e) => this.handleImportFile(e));
    this.elements.clearTranscriptionsBtn.addEventListener('click', () => this.clearTranscriptions());
    this.elements.resetSettingsBtn.addEventListener('click', () => this.resetAllSettings());
    
    // Listen for speaker mapping updates (delegated)
    this.elements.speakerMappings.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-speaker')) {
        this.deleteSpeaker(e.target.dataset.userId);
      }
    });
    
    this.elements.speakerMappings.addEventListener('change', (e) => {
      if (e.target.classList.contains('speaker-name-input')) {
        const row = e.target.closest('.speaker-mapping-row');
        const userId = row.dataset.userId;
        this.updateSpeakerName(userId, e.target.value);
      }
    });
    
    // Modal close on background click
    this.elements.addSpeakerModal.addEventListener('click', (e) => {
      if (e.target === this.elements.addSpeakerModal) {
        this.elements.addSpeakerModal.classList.remove('show');
      }
    });
  }
  
  async loadSettings() {
    try {
      console.log('[Options] Loading settings...');
      
      // Load all settings from storage
      const stored = await chrome.storage.local.get([
        'openaiApiKey',
        'apiEndpoint',
        'speakerMappings',
        'autoStart',
        'bufferDuration',
        'silenceThreshold',
        'silenceTimeout',
        'debugMode',
        'performanceMode',
        'maxTranscriptions',
        'maxRetries',
        'autoLearnSpeakers'
      ]);
      
      // Apply API settings
      if (stored.openaiApiKey) {
        this.elements.apiKey.value = stored.openaiApiKey;
      }
      
      if (stored.apiEndpoint) {
        this.elements.apiEndpoint.value = stored.apiEndpoint;
      }
      
      // Apply capture settings
      this.elements.autoStart.checked = stored.autoStart !== false;
      this.elements.bufferDuration.value = stored.bufferDuration || 1.5;
      this.elements.bufferDurationValue.textContent = `${this.elements.bufferDuration.value}s`;
      this.elements.silenceThreshold.value = stored.silenceThreshold || '0.001';
      this.elements.silenceTimeout.value = stored.silenceTimeout || '2000';
      
      // Apply advanced settings
      this.elements.debugMode.checked = stored.debugMode || false;
      this.elements.performanceMode.checked = stored.performanceMode || false;
      this.elements.maxTranscriptions.value = stored.maxTranscriptions || 1000;
      this.elements.maxRetries.value = stored.maxRetries || 5;
      
      // Load speaker mappings
      if (stored.speakerMappings) {
        this.speakerMappings = new Map(Object.entries(stored.speakerMappings));
        this.renderSpeakerMappings();
      }
      
      // Auto-learn status
      this.autoLearnEnabled = stored.autoLearnSpeakers || false;
      this.updateAutoLearnUI();
      
      console.log('[Options] Settings loaded successfully');
      
    } catch (error) {
      console.error('[Options] Failed to load settings:', error);
      this.showError('Failed to load settings');
    }
  }
  
  async loadStatistics() {
    try {
      // Get service worker status
      const status = await this.sendMessage({ type: 'getStatus' });
      
      if (status) {
        // Update stats display
        this.elements.totalTranscriptions.textContent = status.stats?.transcriptionsSent || '0';
        this.elements.knownSpeakers.textContent = this.speakerMappings.size;
        
        // Calculate uptime
        if (status.stats?.serviceStartTime) {
          const uptime = Date.now() - status.stats.serviceStartTime;
          this.elements.serviceUptime.textContent = this.formatUptime(uptime);
        }
      }
      
      // Get storage usage
      const storage = await chrome.storage.local.getBytesInUse();
      this.elements.storageUsed.textContent = this.formatBytes(storage);
      
    } catch (error) {
      console.error('[Options] Failed to load statistics:', error);
    }
  }
  
  renderSpeakerMappings() {
    const rows = Array.from(this.speakerMappings).map(([userId, name]) => `
      <div class="speaker-mapping-row" data-user-id="${userId}">
        <span class="user-id" title="${userId}">${userId}</span>
        <input type="text" value="${this.escapeHtml(name)}" class="speaker-name-input" />
        <button class="btn-icon delete-speaker" data-user-id="${userId}" title="Delete">🗑️</button>
      </div>
    `).join('');
    
    this.elements.speakerMappings.innerHTML = `
      <div class="speaker-mapping-header">
        <span>User ID</span>
        <span>Speaker Name</span>
        <span>Actions</span>
      </div>
      ${rows || '<div style="padding: 20px; text-align: center; color: #999;">No speaker mappings configured</div>'}
    `;
  }
  
  toggleApiKeyVisibility() {
    const input = this.elements.apiKey;
    const button = this.elements.toggleApiKey;
    
    if (input.type === 'password') {
      input.type = 'text';
      button.textContent = '🙈';
    } else {
      input.type = 'password';
      button.textContent = '👁️';
    }
  }
  
  async saveApiSettings() {
    const apiKey = this.elements.apiKey.value.trim();
    const apiEndpoint = this.elements.apiEndpoint.value.trim();
    
    // Validate API key
    if (!apiKey) {
      this.showError('Please enter an API key');
      return;
    }
    
    if (!apiKey.startsWith('sk-')) {
      this.showError('Invalid API key format. Should start with "sk-"');
      return;
    }
    
    try {
      // Save to storage
      await chrome.storage.local.set({
        openaiApiKey: apiKey,
        apiEndpoint: apiEndpoint || null
      });
      
      // Notify service worker
      await this.sendMessage({
        type: 'setApiKey',
        apiKey: apiKey
      });
      
      if (apiEndpoint) {
        await this.sendMessage({
          type: 'updateSettings',
          settings: { apiEndpoint }
        });
      }
      
      this.showSuccess('API settings saved successfully');
      
    } catch (error) {
      console.error('[Options] Failed to save API settings:', error);
      this.showError('Failed to save API settings');
    }
  }
  
  async saveCaptureSettings() {
    const settings = {
      autoStart: this.elements.autoStart.checked,
      bufferDuration: parseFloat(this.elements.bufferDuration.value),
      silenceThreshold: parseFloat(this.elements.silenceThreshold.value),
      silenceTimeout: parseInt(this.elements.silenceTimeout.value)
    };
    
    try {
      await chrome.storage.local.set(settings);
      
      // Update service worker config
      await this.sendMessage({
        type: 'updateSettings',
        settings: {
          config: {
            bufferDuration: settings.bufferDuration,
            silenceTimeout: settings.silenceTimeout
          }
        }
      });
      
      this.showSuccess('Capture settings saved successfully');
      
    } catch (error) {
      console.error('[Options] Failed to save capture settings:', error);
      this.showError('Failed to save capture settings');
    }
  }
  
  async saveAdvancedSettings() {
    const settings = {
      debugMode: this.elements.debugMode.checked,
      performanceMode: this.elements.performanceMode.checked,
      maxTranscriptions: parseInt(this.elements.maxTranscriptions.value),
      maxRetries: parseInt(this.elements.maxRetries.value)
    };
    
    try {
      await chrome.storage.local.set(settings);
      
      // Update service worker config
      await this.sendMessage({
        type: 'updateSettings',
        settings: {
          config: {
            maxTranscriptionHistory: settings.maxTranscriptions,
            maxRetries: settings.maxRetries
          },
          debugMode: settings.debugMode
        }
      });
      
      this.showSuccess('Advanced settings saved successfully');
      
    } catch (error) {
      console.error('[Options] Failed to save advanced settings:', error);
      this.showError('Failed to save advanced settings');
    }
  }
  
  showAddSpeakerModal() {
    this.elements.newUserId.value = '';
    this.elements.newSpeakerName.value = '';
    this.elements.addSpeakerModal.classList.add('show');
    this.elements.newUserId.focus();
  }
  
  async addSpeaker() {
    const userId = this.elements.newUserId.value.trim();
    const speakerName = this.elements.newSpeakerName.value.trim();
    
    if (!userId || !speakerName) {
      this.showError('Please enter both User ID and Speaker Name');
      return;
    }
    
    // Add to mappings
    this.speakerMappings.set(userId, speakerName);
    
    // Save and update
    await this.saveSpeakerMappings();
    
    // Update service worker
    await this.sendMessage({
      type: 'updateSpeakerMapping',
      userId,
      speakerName
    });
    
    // Close modal and re-render
    this.elements.addSpeakerModal.classList.remove('show');
    this.renderSpeakerMappings();
    this.showSuccess('Speaker mapping added');
  }
  
  async updateSpeakerName(userId, newName) {
    if (!newName.trim()) return;
    
    this.speakerMappings.set(userId, newName.trim());
    await this.saveSpeakerMappings();
    
    // Update service worker
    await this.sendMessage({
      type: 'updateSpeakerMapping',
      userId,
      speakerName: newName.trim()
    });
  }
  
  async deleteSpeaker(userId) {
    if (!confirm('Delete this speaker mapping?')) return;
    
    this.speakerMappings.delete(userId);
    await this.saveSpeakerMappings();
    this.renderSpeakerMappings();
    this.showSuccess('Speaker mapping deleted');
  }
  
  async saveSpeakerMappings() {
    const mappingsObject = Object.fromEntries(this.speakerMappings);
    await chrome.storage.local.set({ speakerMappings: mappingsObject });
  }
  
  async toggleAutoLearn() {
    this.autoLearnEnabled = !this.autoLearnEnabled;
    await chrome.storage.local.set({ autoLearnSpeakers: this.autoLearnEnabled });
    this.updateAutoLearnUI();
    
    const message = this.autoLearnEnabled ? 
      'Auto-learn enabled. New speakers will be added automatically.' : 
      'Auto-learn disabled';
    this.showSuccess(message);
  }
  
  updateAutoLearnUI() {
    this.elements.autoLearnStatus.textContent = this.autoLearnEnabled ? 'On' : 'Off';
    this.elements.autoLearnToggle.style.background = this.autoLearnEnabled ? 
      'var(--success)' : '#e9ecef';
    this.elements.autoLearnToggle.style.color = this.autoLearnEnabled ? 
      'white' : '#333';
  }
  
  async exportSpeakers() {
    const data = {
      speakerMappings: Object.fromEntries(this.speakerMappings),
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vtf-speakers-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.showSuccess('Speaker mappings exported');
  }
  
  async importSpeakers() {
    this.elements.importFileInput.accept = '.json';
    this.elements.importFileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (data.speakerMappings) {
          // Merge with existing
          Object.entries(data.speakerMappings).forEach(([userId, name]) => {
            this.speakerMappings.set(userId, name);
          });
          
          await this.saveSpeakerMappings();
          this.renderSpeakerMappings();
          this.showSuccess('Speaker mappings imported successfully');
        } else {
          this.showError('Invalid speaker mappings file');
        }
      } catch (error) {
        console.error('[Options] Import error:', error);
        this.showError('Failed to import speaker mappings');
      }
      
      // Reset input
      e.target.value = '';
    };
    
    this.elements.importFileInput.click();
  }
  
  async exportAllData() {
    try {
      // Get all settings
      const allSettings = await chrome.storage.local.get(null);
      
      // Get transcription history
      const transcriptions = await this.sendMessage({ type: 'getTranscriptions' });
      
      // Get service status
      const status = await this.sendMessage({ type: 'getStatus' });
      
      const exportData = {
        version: '2.0.0',
        exportDate: new Date().toISOString(),
        settings: allSettings,
        transcriptions: transcriptions?.transcriptions || [],
        statistics: status?.stats || {},
        speakerMappings: Object.fromEntries(this.speakerMappings)
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vtf-audio-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      this.showSuccess('All data exported successfully');
      
    } catch (error) {
      console.error('[Options] Export error:', error);
      this.showError('Failed to export data');
    }
  }
  
  async handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.version || !data.settings) {
        throw new Error('Invalid import file format');
      }
      
      if (confirm('This will overwrite your current settings. Continue?')) {
        // Import settings
        await chrome.storage.local.set(data.settings);
        
        // Import speaker mappings
        if (data.speakerMappings) {
          this.speakerMappings = new Map(Object.entries(data.speakerMappings));
          await this.saveSpeakerMappings();
        }
        
        // Reload UI
        await this.loadSettings();
        
        this.showSuccess('Data imported successfully');
      }
    } catch (error) {
      console.error('[Options] Import error:', error);
      this.showError('Failed to import data. Please check the file format.');
    }
    
    // Reset input
    event.target.value = '';
  }
  
  async clearTranscriptions() {
    if (!confirm('This will delete all transcription history. Are you sure?')) return;
    
    try {
      await this.sendMessage({ type: 'clearTranscriptions' });
      await chrome.storage.local.remove('transcriptions');
      
      this.showSuccess('Transcription history cleared');
      
      // Update stats
      this.loadStatistics();
      
    } catch (error) {
      console.error('[Options] Clear error:', error);
      this.showError('Failed to clear transcriptions');
    }
  }
  
  async resetAllSettings() {
    if (!confirm('This will reset ALL settings to defaults. Your API key and transcriptions will be deleted. Continue?')) {
      return;
    }
    
    try {
      // Clear all storage
      await chrome.storage.local.clear();
      
      // Reset UI to defaults
      this.elements.apiKey.value = '';
      this.elements.apiEndpoint.value = '';
      this.elements.autoStart.checked = true;
      this.elements.bufferDuration.value = 1.5;
      this.elements.silenceThreshold.value = '0.001';
      this.elements.silenceTimeout.value = '2000';
      this.elements.debugMode.checked = false;
      this.elements.performanceMode.checked = false;
      this.elements.maxTranscriptions.value = 1000;
      this.elements.maxRetries.value = 5;
      
      // Clear speaker mappings
      this.speakerMappings.clear();
      this.renderSpeakerMappings();
      
      this.showSuccess('All settings reset to defaults');
      
      // Reload stats
      this.loadStatistics();
      
    } catch (error) {
      console.error('[Options] Reset error:', error);
      this.showError('Failed to reset settings');
    }
  }
  
  async sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          console.error('[Options] Message error:', chrome.runtime.lastError);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  }
  
  showSuccess(message) {
    this.elements.successMessage.textContent = message;
    this.elements.successMessage.classList.remove('hidden');
    this.elements.errorMessage.classList.add('hidden');
    
    setTimeout(() => {
      this.elements.successMessage.classList.add('hidden');
    }, 3000);
  }
  
  showError(message) {
    this.elements.errorMessage.textContent = message;
    this.elements.errorMessage.classList.remove('hidden');
    this.elements.successMessage.classList.add('hidden');
    
    setTimeout(() => {
      this.elements.errorMessage.classList.add('hidden');
    }, 5000);
  }
  
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
  
  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Options] Initializing options page');
  window.vtfOptions = new VTFOptions();
});