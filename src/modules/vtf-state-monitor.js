/**
 * VTFStateMonitor - Synchronizes with VTF global state
 * 
 * This module monitors VTF's global state for changes including volume,
 * session state, and user counts. It also hooks into VTF functions to
 * detect reconnection events and other state changes.
 * 
 * @module vtf-state-monitor
 */

export class VTFStateMonitor {
    constructor(options = {}) {
      // Configuration
      this.config = {
        defaultSyncInterval: 1000,  // ms between state checks
        volumeThreshold: 0.01,      // minimum volume change to trigger event
        enableDebugLogs: false,
        ...options
      };
      
      // Last known state
      this.lastKnownState = {
        volume: 1.0,
        sessionState: 'unknown',
        talkingUsers: new Map(),
        reconnectCount: 0,
        preferences: {},
        lastSync: null
      };
      
      // Event callbacks
      this.callbacks = {
        onVolumeChanged: [],
        onSessionStateChanged: [],
        onReconnect: [],
        onTalkingUsersChanged: [],
        onPreferencesChanged: [],
        onSyncError: []
      };
      
      // Internal state
      this.syncInterval = null;
      this.hookedFunctions = new Map(); // functionName -> {original, hooked}
      this.isDestroyed = false;
      this.syncCount = 0;
      this.errorCount = 0;
      
      // Track globals finder reference
      this.globalsFinder = null;
    }
    
    /**
     * Start synchronizing with VTF state
     * @param {Object} globalsFinder - VTFGlobalsFinder instance
     * @param {number} interval - Sync interval in milliseconds
     * @returns {boolean} - True if sync started successfully
     */
    startSync(globalsFinder, interval = 1000) {
      if (!globalsFinder || typeof globalsFinder !== 'object') {
        console.error('[State Monitor] Invalid globalsFinder provided');
        return false;
      }
      
      if (this.syncInterval) {
        console.warn('[State Monitor] Sync already running, stopping previous sync');
        this.stopSync();
      }
      
      console.log('[State Monitor] Starting synchronization');
      
      this.globalsFinder = globalsFinder;
      
      // Initial sync
      this.syncState(globalsFinder);
      
      // Hook VTF functions
      this.hookVTFFunctions(globalsFinder);
      
      // Start periodic sync
      this.syncInterval = setInterval(() => {
        if (!this.isDestroyed) {
          this.syncState(globalsFinder);
        }
      }, interval);
      
      return true;
    }
    
    /**
     * Stop synchronization
     */
    stopSync() {
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = null;
        console.log('[State Monitor] Synchronization stopped');
      }
      
      // Unhook functions
      this.unhookVTFFunctions();
    }
    
    /**
     * Manually sync state
     * @param {Object} globalsFinder - VTFGlobalsFinder instance
     */
    syncState(globalsFinder) {
      if (this.isDestroyed) return;
      
      try {
        const globals = globalsFinder.globals;
        if (!globals) {
          if (this.config.enableDebugLogs) {
            console.log('[State Monitor] No globals available for sync');
          }
          return;
        }
        
        this.syncCount++;
        let hasChanges = false;
        
        // Check volume
        const currentVolume = this.normalizeVolume(globals.audioVolume);
        if (Math.abs(currentVolume - this.lastKnownState.volume) > this.config.volumeThreshold) {
          const oldVolume = this.lastKnownState.volume;
          this.lastKnownState.volume = currentVolume;
          console.log(`[State Monitor] Volume changed: ${oldVolume.toFixed(2)} → ${currentVolume.toFixed(2)}`);
          this.emit('onVolumeChanged', currentVolume, oldVolume);
          hasChanges = true;
        }
        
        // Check session state
        const sessionState = globals.sessData?.currentState || 'unknown';
        if (sessionState !== this.lastKnownState.sessionState) {
          const oldState = this.lastKnownState.sessionState;
          this.lastKnownState.sessionState = sessionState;
          console.log(`[State Monitor] Session state changed: ${oldState} → ${sessionState}`);
          this.emit('onSessionStateChanged', sessionState, oldState);
          hasChanges = true;
        }
        
        // Check talking users
        const talkingUsers = this.getTalkingUsers(globals, globalsFinder);
        if (this.hasTalkingUsersChanged(talkingUsers)) {
          const oldUsers = new Map(this.lastKnownState.talkingUsers);
          this.lastKnownState.talkingUsers = new Map(talkingUsers);
          console.log(`[State Monitor] Talking users changed: ${oldUsers.size} → ${talkingUsers.size}`);
          this.emit('onTalkingUsersChanged', talkingUsers, oldUsers);
          hasChanges = true;
        }
        
        // Check preferences
        if (this.havePreferencesChanged(globals.preferences)) {
          const oldPrefs = { ...this.lastKnownState.preferences };
          this.lastKnownState.preferences = { ...globals.preferences };
          console.log('[State Monitor] Preferences changed');
          this.emit('onPreferencesChanged', this.lastKnownState.preferences, oldPrefs);
          hasChanges = true;
        }
        
        // Update last sync time
        this.lastKnownState.lastSync = Date.now();
        
        if (this.config.enableDebugLogs && hasChanges) {
          console.log('[State Monitor] Sync completed with changes');
        }
        
      } catch (error) {
        this.errorCount++;
        console.error('[State Monitor] Error during sync:', error);
        this.emit('onSyncError', error);
      }
    }
    
    /**
     * Hook into VTF functions to detect events
     * @param {Object} globalsFinder - VTFGlobalsFinder instance
     */
    hookVTFFunctions(globalsFinder) {
      // Hook reconnectAudio
      this.hookFunction('reconnectAudio', 
        () => this.findFunction('reconnectAudio', globalsFinder),
        () => {
          console.log('[State Monitor] reconnectAudio called');
          this.lastKnownState.reconnectCount++;
          this.emit('onReconnect', this.lastKnownState.reconnectCount);
        }
      );
      
      // Hook adjustVol
      this.hookFunction('adjustVol',
        () => this.findFunction('adjustVol', globalsFinder),
        (event) => {
          // Volume change will be detected in next sync
          if (this.config.enableDebugLogs) {
            console.log('[State Monitor] adjustVol called');
          }
        }
      );
      
      // Hook mute/unmute if available
      this.hookFunction('mute',
        () => this.findFunction('mute', globalsFinder),
        () => {
          console.log('[State Monitor] mute called');
          // Force immediate sync to catch mute state
          if (this.globalsFinder) {
            setTimeout(() => this.syncState(this.globalsFinder), 50);
          }
        }
      );
      
      this.hookFunction('unMute',
        () => this.findFunction('unMute', globalsFinder),
        () => {
          console.log('[State Monitor] unMute called');
          // Force immediate sync
          if (this.globalsFinder) {
            setTimeout(() => this.syncState(this.globalsFinder), 50);
          }
        }
      );
    }
    
    /**
     * Find a VTF function in various locations
     * @private
     */
    findFunction(funcName, globalsFinder) {
      // Check window
      if (typeof window[funcName] === 'function') {
        return { obj: window, func: window[funcName] };
      }
      
      // Check mediaSoupService
      if (globalsFinder.mediaSoupService && 
          typeof globalsFinder.mediaSoupService[funcName] === 'function') {
        return { obj: globalsFinder.mediaSoupService, func: globalsFinder.mediaSoupService[funcName] };
      }
      
      // Check appService
      if (globalsFinder.appService && 
          typeof globalsFinder.appService[funcName] === 'function') {
        return { obj: globalsFinder.appService, func: globalsFinder.appService[funcName] };
      }
      
      return null;
    }
    
    /**
     * Hook a single function
     * @private
     */
    hookFunction(funcName, findFunc, beforeHook) {
      try {
        const found = findFunc();
        if (!found) {
          if (this.config.enableDebugLogs) {
            console.log(`[State Monitor] Function ${funcName} not found for hooking`);
          }
          return;
        }
        
        const { obj, func } = found;
        
        // Don't hook if already hooked
        if (this.hookedFunctions.has(funcName)) {
          return;
        }
        
        // Create hooked version
        const hooked = function(...args) {
          try {
            beforeHook(...args);
          } catch (error) {
            console.error(`[State Monitor] Error in ${funcName} hook:`, error);
          }
          // Call original
          return func.apply(this, args);
        };
        
        // Store reference
        this.hookedFunctions.set(funcName, {
          obj,
          original: func,
          hooked,
          propertyName: funcName
        });
        
        // Replace function
        obj[funcName] = hooked;
        
        console.log(`[State Monitor] Hooked ${funcName} function`);
        
      } catch (error) {
        console.error(`[State Monitor] Failed to hook ${funcName}:`, error);
      }
    }
    
    /**
     * Unhook all VTF functions
     * @private
     */
    unhookVTFFunctions() {
      for (const [funcName, hookInfo] of this.hookedFunctions) {
        try {
          hookInfo.obj[hookInfo.propertyName] = hookInfo.original;
          console.log(`[State Monitor] Unhooked ${funcName} function`);
        } catch (error) {
          console.error(`[State Monitor] Failed to unhook ${funcName}:`, error);
        }
      }
      this.hookedFunctions.clear();
    }
    
    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @returns {boolean} - True if listener added
     */
    on(event, callback) {
      if (!this.callbacks[event]) {
        console.error(`[State Monitor] Unknown event: ${event}`);
        return false;
      }
      
      if (typeof callback !== 'function') {
        console.error('[State Monitor] Callback must be a function');
        return false;
      }
      
      this.callbacks[event].push(callback);
      return true;
    }
    
    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function to remove
     * @returns {boolean} - True if listener removed
     */
    off(event, callback) {
      if (!this.callbacks[event]) {
        return false;
      }
      
      const index = this.callbacks[event].indexOf(callback);
      if (index > -1) {
        this.callbacks[event].splice(index, 1);
        return true;
      }
      return false;
    }
    
    /**
     * Emit event to all listeners
     * @param {string} event - Event name
     * @param {...any} args - Arguments to pass to callbacks
     */
    emit(event, ...args) {
      if (!this.callbacks[event]) {
        return;
      }
      
      // Call each callback, catching errors
      for (const callback of this.callbacks[event]) {
        try {
          callback(...args);
        } catch (error) {
          console.error(`[State Monitor] Error in ${event} callback:`, error);
        }
      }
    }
    
    /**
     * Get current state snapshot
     * @returns {Object} - Copy of current state
     */
    getState() {
      return {
        volume: this.lastKnownState.volume,
        sessionState: this.lastKnownState.sessionState,
        talkingUsersCount: this.lastKnownState.talkingUsers.size,
        reconnectCount: this.lastKnownState.reconnectCount,
        preferences: { ...this.lastKnownState.preferences },
        lastSync: this.lastKnownState.lastSync,
        isActive: !!this.syncInterval
      };
    }
    
    /**
     * Get talking users from various sources
     * @private
     */
    getTalkingUsers(globals, globalsFinder) {
      // Try globals first
      if (globals.talkingUsers instanceof Map) {
        return globals.talkingUsers;
      }
      
      // Try mediaSoupService
      if (globalsFinder.mediaSoupService?.talkingUsers instanceof Map) {
        return globalsFinder.mediaSoupService.talkingUsers;
      }
      
      // Return empty map as fallback
      return new Map();
    }
    
    /**
     * Check if talking users have changed
     * @private
     */
    hasTalkingUsersChanged(newUsers) {
      const oldUsers = this.lastKnownState.talkingUsers;
      
      // Check size first
      if (oldUsers.size !== newUsers.size) {
        return true;
      }
      
      // Check each user
      for (const [userId, userData] of newUsers) {
        if (!oldUsers.has(userId)) {
          return true;
        }
      }
      
      return false;
    }
    
    /**
     * Check if preferences have changed
     * @private
     */
    havePreferencesChanged(newPrefs) {
      if (!newPrefs) return false;
      
      const oldPrefs = this.lastKnownState.preferences;
      const oldKeys = Object.keys(oldPrefs);
      const newKeys = Object.keys(newPrefs);
      
      // Check key count
      if (oldKeys.length !== newKeys.length) {
        return true;
      }
      
      // Check each value
      for (const key of newKeys) {
        if (oldPrefs[key] !== newPrefs[key]) {
          return true;
        }
      }
      
      return false;
    }
    
    /**
     * Normalize volume value
     * @private
     */
    normalizeVolume(volume) {
      if (typeof volume !== 'number') {
        return 1.0;
      }
      return Math.max(0, Math.min(1, volume));
    }
    
    /**
     * Get debug information
     * @returns {Object} - Debug state
     */
    debug() {
      return {
        config: { ...this.config },
        lastKnownState: {
          ...this.getState(),
          talkingUsers: Array.from(this.lastKnownState.talkingUsers.keys())
        },
        syncActive: !!this.syncInterval,
        syncCount: this.syncCount,
        errorCount: this.errorCount,
        hookedFunctions: Array.from(this.hookedFunctions.keys()),
        listenerCounts: Object.fromEntries(
          Object.entries(this.callbacks).map(([event, listeners]) => [event, listeners.length])
        ),
        isDestroyed: this.isDestroyed
      };
    }
    
    /**
     * Clean up and destroy the monitor
     */
    destroy() {
      console.log('[State Monitor] Destroying state monitor');
      
      this.isDestroyed = true;
      
      // Stop sync
      this.stopSync();
      
      // Clear all listeners
      for (const event in this.callbacks) {
        this.callbacks[event] = [];
      }
      
      // Clear references
      this.globalsFinder = null;
      this.lastKnownState.talkingUsers.clear();
    }
  }
  
  // Export as default as well
  export default VTFStateMonitor;