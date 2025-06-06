/**
 * Usage examples for VTFStateMonitor
 * Shows integration with VTFGlobalsFinder and state management patterns
 */

import { VTFStateMonitor } from './vtf-state-monitor.js';

// Mock VTFGlobalsFinder for examples (in real usage, import the actual module)
class MockVTFGlobalsFinder {
  constructor() {
    this.globals = {
      audioVolume: 0.8,
      sessData: { currentState: 'open' },
      preferences: { 
        theme: 'dark',
        autoRecord: true,
        language: 'en'
      },
      talkingUsers: new Map()
    };
    
    this.mediaSoupService = {
      reconnectAudio: () => console.log('[VTF] reconnectAudio called')
    };
  }
}

// Example 1: Basic state monitoring
async function basicStateMonitoring() {
  console.log('--- Example 1: Basic State Monitoring ---');
  
  const globalsFinder = new MockVTFGlobalsFinder();
  const stateMonitor = new VTFStateMonitor({
    volumeThreshold: 0.05,  // 5% change threshold
    enableDebugLogs: true
  });
  
  // Set up listeners
  stateMonitor.on('onVolumeChanged', (newVolume, oldVolume) => {
    console.log(`Volume changed: ${oldVolume} → ${newVolume}`);
    // Update UI or audio capture settings
  });
  
  stateMonitor.on('onSessionStateChanged', (newState, oldState) => {
    console.log(`Session state changed: ${oldState} → ${newState}`);
    if (newState === 'closed') {
      console.log('Session closed - stopping audio capture');
    }
  });
  
  // Start monitoring
  stateMonitor.startSync(globalsFinder, 500); // Check every 500ms
  
  // Simulate changes
  setTimeout(() => {
    globalsFinder.globals.audioVolume = 0.5;
    console.log('Simulated volume change to 0.5');
  }, 1000);
  
  setTimeout(() => {
    globalsFinder.globals.sessData.currentState = 'closed';
    console.log('Simulated session close');
  }, 2000);
  
  // Get state after changes
  setTimeout(() => {
    const currentState = stateMonitor.getState();
    console.log('Current state:', currentState);
    stateMonitor.destroy();
  }, 3000);
}

// Example 2: Integration with audio system
async function audioSystemIntegration() {
  console.log('\n--- Example 2: Audio System Integration ---');
  
  class AudioManager {
    constructor() {
      this.globalsFinder = new MockVTFGlobalsFinder();
      this.stateMonitor = new VTFStateMonitor();
      this.captureVolume = 1.0;
    }
    
    initialize() {
      // React to volume changes
      this.stateMonitor.on('onVolumeChanged', (newVolume) => {
        this.updateCaptureVolume(newVolume);
      });
      
      // React to reconnect events
      this.stateMonitor.on('onReconnect', (count) => {
        console.log(`[Audio Manager] Handling reconnect #${count}`);
        this.resetAllCaptures();
      });
      
      // React to session changes
      this.stateMonitor.on('onSessionStateChanged', (state) => {
        if (state === 'closed') {
          this.stopAllCaptures();
        } else if (state === 'open') {
          this.startCaptures();
        }
      });
      
      // Start monitoring
      this.stateMonitor.startSync(this.globalsFinder, 1000);
      
      // Get initial state
      const state = this.stateMonitor.getState();
      this.updateCaptureVolume(state.volume);
    }
    
    updateCaptureVolume(vtfVolume) {
      this.captureVolume = vtfVolume;
      console.log(`[Audio Manager] Updated capture volume to ${vtfVolume}`);
    }
    
    resetAllCaptures() {
      console.log('[Audio Manager] Resetting all audio captures');
    }
    
    stopAllCaptures() {
      console.log('[Audio Manager] Stopping all captures');
    }
    
    startCaptures() {
      console.log('[Audio Manager] Starting captures');
    }
    
    destroy() {
      this.stateMonitor.destroy();
    }
  }
  
  const audioManager = new AudioManager();
  audioManager.initialize();
  
  // Simulate VTF reconnect
  setTimeout(() => {
    audioManager.globalsFinder.mediaSoupService.reconnectAudio();
  }, 1500);
  
  setTimeout(() => {
    audioManager.destroy();
  }, 3000);
}

// Example 3: User tracking
async function userTrackingExample() {
  console.log('\n--- Example 3: User Tracking ---');
  
  const globalsFinder = new MockVTFGlobalsFinder();
  const stateMonitor = new VTFStateMonitor();
  
  // Track active users
  const activeUsers = new Map();
  
  stateMonitor.on('onTalkingUsersChanged', (newUsers, oldUsers) => {
    // Find added users
    for (const [userId, userData] of newUsers) {
      if (!oldUsers.has(userId)) {
        console.log(`User joined: ${userId}`);
        activeUsers.set(userId, {
          joinTime: Date.now(),
          data: userData
        });
      }
    }
    
    // Find removed users
    for (const [userId] of oldUsers) {
      if (!newUsers.has(userId)) {
        console.log(`User left: ${userId}`);
        const user = activeUsers.get(userId);
        if (user) {
          const duration = Date.now() - user.joinTime;
          console.log(`User ${userId} was active for ${(duration / 1000).toFixed(1)}s`);
          activeUsers.delete(userId);
        }
      }
    }
  });
  
  stateMonitor.startSync(globalsFinder, 250);
  
  // Simulate user activity
  setTimeout(() => {
    globalsFinder.globals.talkingUsers.set('alice', { name: 'Alice', role: 'speaker' });
    globalsFinder.globals.talkingUsers.set('bob', { name: 'Bob', role: 'listener' });
  }, 500);
  
  setTimeout(() => {
    globalsFinder.globals.talkingUsers.set('charlie', { name: 'Charlie', role: 'speaker' });
  }, 1000);
  
  setTimeout(() => {
    globalsFinder.globals.talkingUsers.delete('alice');
  }, 1500);
  
  setTimeout(() => {
    console.log('Final active users:', Array.from(activeUsers.keys()));
    stateMonitor.destroy();
  }, 2000);
}

// Example 4: Preferences sync
async function preferencesSyncExample() {
  console.log('\n--- Example 4: Preferences Sync ---');
  
  const globalsFinder = new MockVTFGlobalsFinder();
  const stateMonitor = new VTFStateMonitor();
  
  // Local settings that sync with VTF
  const localSettings = {
    theme: 'dark',
    autoRecord: true,
    language: 'en'
  };
  
  stateMonitor.on('onPreferencesChanged', (newPrefs, oldPrefs) => {
    console.log('VTF preferences changed');
    
    // Find what changed
    for (const key in newPrefs) {
      if (newPrefs[key] !== oldPrefs[key]) {
        console.log(`  ${key}: ${oldPrefs[key]} → ${newPrefs[key]}`);
        
        // Update local settings
        if (key in localSettings) {
          localSettings[key] = newPrefs[key];
        }
      }
    }
    
    // Apply changes
    applySettings(localSettings);
  });
  
  function applySettings(settings) {
    console.log('Applying settings:', settings);
    // Update UI theme, language, etc.
  }
  
  stateMonitor.startSync(globalsFinder, 500);
  
  // Simulate preference changes
  setTimeout(() => {
    globalsFinder.globals.preferences.theme = 'light';
    globalsFinder.globals.preferences.autoRecord = false;
  }, 1000);
  
  setTimeout(() => {
    globalsFinder.globals.preferences.language = 'es';
    globalsFinder.globals.preferences.newFeature = true;
  }, 1500);
  
  setTimeout(() => {
    console.log('Final local settings:', localSettings);
    stateMonitor.destroy();
  }, 2500);
}

// Example 5: Complete extension integration
async function completeIntegrationExample() {
  console.log('\n--- Example 5: Complete Extension Integration ---');
  
  class VTFExtension {
    constructor() {
      this.globalsFinder = new MockVTFGlobalsFinder();
      this.stateMonitor = new VTFStateMonitor();
      this.isActive = false;
      this.stats = {
        volumeChanges: 0,
        reconnects: 0,
        stateChanges: 0,
        errors: 0
      };
    }
    
    async initialize() {
      console.log('[Extension] Initializing...');
      
      // Set up all event handlers
      this.setupEventHandlers();
      
      // Start state monitoring
      const started = this.stateMonitor.startSync(this.globalsFinder, 500);
      if (!started) {
        throw new Error('Failed to start state monitoring');
      }
      
      // Get initial state
      const state = this.stateMonitor.getState();
      console.log('[Extension] Initial state:', state);
      
      this.isActive = true;
      console.log('[Extension] Initialization complete');
    }
    
    setupEventHandlers() {
      // Volume changes
      this.stateMonitor.on('onVolumeChanged', (newVol, oldVol) => {
        this.stats.volumeChanges++;
        this.handleVolumeChange(newVol, oldVol);
      });
      
      // Session state
      this.stateMonitor.on('onSessionStateChanged', (newState, oldState) => {
        this.stats.stateChanges++;
        this.handleSessionChange(newState, oldState);
      });
      
      // Reconnects
      this.stateMonitor.on('onReconnect', (count) => {
        this.stats.reconnects++;
        this.handleReconnect(count);
      });
      
      // Errors
      this.stateMonitor.on('onSyncError', (error) => {
        this.stats.errors++;
        console.error('[Extension] Sync error:', error);
      });
    }
    
    handleVolumeChange(newVol, oldVol) {
      console.log(`[Extension] Volume: ${oldVol} → ${newVol}`);
      // Update audio capture volume
      // Update UI volume indicator
    }
    
    handleSessionChange(newState, oldState) {
      console.log(`[Extension] Session: ${oldState} → ${newState}`);
      
      switch (newState) {
        case 'open':
          this.startRecording();
          break;
        case 'closed':
          this.stopRecording();
          break;
        case 'error':
          this.handleError();
          break;
      }
    }
    
    handleReconnect(count) {
      console.log(`[Extension] Reconnect #${count}`);
      this.resetAll();
    }
    
    startRecording() {
      console.log('[Extension] Starting recording');
    }
    
    stopRecording() {
      console.log('[Extension] Stopping recording');
    }
    
    handleError() {
      console.log('[Extension] Handling error state');
    }
    
    resetAll() {
      console.log('[Extension] Resetting all systems');
    }
    
    getStats() {
      return {
        ...this.stats,
        isActive: this.isActive,
        monitorDebug: this.stateMonitor.debug()
      };
    }
    
    destroy() {
      console.log('[Extension] Shutting down');
      this.isActive = false;
      this.stateMonitor.destroy();
    }
  }
  
  // Use the extension
  const extension = new VTFExtension();
  await extension.initialize();
  
  // Simulate VTF activity
  setTimeout(() => {
    extension.globalsFinder.globals.audioVolume = 0.6;
  }, 500);
  
  setTimeout(() => {
    extension.globalsFinder.mediaSoupService.reconnectAudio();
  }, 1000);
  
  setTimeout(() => {
    extension.globalsFinder.globals.sessData.currentState = 'closed';
  }, 1500);
  
  // Show stats
  setTimeout(() => {
    console.log('[Extension] Final stats:', extension.getStats());
    extension.destroy();
  }, 2000);
}

// Run all examples
async function runExamples() {
  console.log('🚀 VTFStateMonitor Usage Examples\n');
  
  await basicStateMonitoring();
  await new Promise(resolve => setTimeout(resolve, 4000));
  
  await audioSystemIntegration();
  await new Promise(resolve => setTimeout(resolve, 4000));
  
  await userTrackingExample();
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  await preferencesSyncExample();
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  await completeIntegrationExample();
  
  console.log('\n✨ All examples completed!');
}

// Export examples
export {
  basicStateMonitoring,
  audioSystemIntegration,
  userTrackingExample,
  preferencesSyncExample,
  completeIntegrationExample,
  runExamples
};

// Auto-run if accessed directly
if (typeof window !== 'undefined' && window.location.href.includes('example')) {
  runExamples();
}