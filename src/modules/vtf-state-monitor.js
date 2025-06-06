export class VTFStateMonitor {
    constructor(options = {}) {
      
      this.config = {
        defaultSyncInterval: 1000,  
        volumeThreshold: 0.01,      
        enableDebugLogs: false,
        ...options
      };
      
      
      this.lastKnownState = {
        volume: 1.0,
        sessionState: 'unknown',
        talkingUsers: new Map(),
        reconnectCount: 0,
        preferences: {},
        lastSync: null
      };
      
      
      this.callbacks = {
        onVolumeChanged: [],
        onSessionStateChanged: [],
        onReconnect: [],
        onTalkingUsersChanged: [],
        onPreferencesChanged: [],
        onSyncError: []
      };
      
      
      this.syncInterval = null;
      this.hookedFunctions = new Map(); 
      this.isDestroyed = false;
      this.syncCount = 0;
      this.errorCount = 0;
      
      
      this.globalsFinder = null;
    }
    
    
    startSync(globalsFinder, interval = 1000) {
      if (!globalsFinder || typeof globalsFinder !== 'object') {
        console.error('[State Monitor] Invalid globalsFinder provided');
        return false;
      }
      
      if (this.syncInterval) {
        
        this.stopSync();
      }
      
      
      this.globalsFinder = globalsFinder;
      
      
      this.syncState(globalsFinder);
      
      
      this.hookVTFFunctions(globalsFinder);
      
      
      this.syncInterval = setInterval(() => {
        if (!this.isDestroyed) {
          this.syncState(globalsFinder);
        }
      }, interval);
      
      return true;
    }
    
    
    stopSync() {
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = null;
        
      }
      
      
      this.unhookVTFFunctions();
    }
    
    
    syncState(globalsFinder) {
      if (this.isDestroyed) return;
      
      try {
        const globals = globalsFinder.globals;
        if (!globals) {
          if (this.config.enableDebugLogs) {
            
          }
          return;
        }
        
        this.syncCount++;
        let hasChanges = false;
        
        
        const currentVolume = this.normalizeVolume(globals.audioVolume);
        if (Math.abs(currentVolume - this.lastKnownState.volume) > this.config.volumeThreshold) {
          const oldVolume = this.lastKnownState.volume;
          this.lastKnownState.volume = currentVolume;
          
          this.emit('onVolumeChanged', currentVolume, oldVolume);
          hasChanges = true;
        }
        
        
        const sessionState = globals.sessData?.currentState || 'unknown';
        if (sessionState !== this.lastKnownState.sessionState) {
          const oldState = this.lastKnownState.sessionState;
          this.lastKnownState.sessionState = sessionState;
          
          this.emit('onSessionStateChanged', sessionState, oldState);
          hasChanges = true;
        }
        
        
        const talkingUsers = this.getTalkingUsers(globals, globalsFinder);
        if (this.hasTalkingUsersChanged(talkingUsers)) {
          const oldUsers = new Map(this.lastKnownState.talkingUsers);
          this.lastKnownState.talkingUsers = new Map(talkingUsers);
          
          this.emit('onTalkingUsersChanged', talkingUsers, oldUsers);
          hasChanges = true;
        }
        
        
        if (this.havePreferencesChanged(globals.preferences)) {
          const oldPrefs = { ...this.lastKnownState.preferences };
          this.lastKnownState.preferences = { ...globals.preferences };
          
          this.emit('onPreferencesChanged', this.lastKnownState.preferences, oldPrefs);
          hasChanges = true;
        }
        
        
        this.lastKnownState.lastSync = Date.now();
        
        if (this.config.enableDebugLogs && hasChanges) {
          
        }
        
      } catch (error) {
        this.errorCount++;
        console.error('[State Monitor] Error during sync:', error);
        this.emit('onSyncError', error);
      }
    }
    
    
    hookVTFFunctions(globalsFinder) {
      
      this.hookFunction('reconnectAudio', 
        () => this.findFunction('reconnectAudio', globalsFinder),
        () => {
          
          this.lastKnownState.reconnectCount++;
          this.emit('onReconnect', this.lastKnownState.reconnectCount);
        }
      );
      
      
      this.hookFunction('adjustVol',
        () => this.findFunction('adjustVol', globalsFinder),
        (event) => {
          
          if (this.config.enableDebugLogs) {
            
          }
        }
      );
      
      
      this.hookFunction('mute',
        () => this.findFunction('mute', globalsFinder),
        () => {
          
          
          if (this.globalsFinder) {
            setTimeout(() => this.syncState(this.globalsFinder), 50);
          }
        }
      );
      
      this.hookFunction('unMute',
        () => this.findFunction('unMute', globalsFinder),
        () => {
          
          
          if (this.globalsFinder) {
            setTimeout(() => this.syncState(this.globalsFinder), 50);
          }
        }
      );
    }
    
    
    findFunction(funcName, globalsFinder) {
      
      if (globalsFinder.roomComponent && 
          typeof globalsFinder.roomComponent[funcName] === 'function') {
        return { 
          obj: globalsFinder.roomComponent, 
          func: globalsFinder.roomComponent[funcName] 
        };
      }
      
      
      if (globalsFinder.mediaSoupService && 
          typeof globalsFinder.mediaSoupService[funcName] === 'function') {
        return { 
          obj: globalsFinder.mediaSoupService, 
          func: globalsFinder.mediaSoupService[funcName] 
        };
      }
      
      
      if (globalsFinder.appService && 
          typeof globalsFinder.appService[funcName] === 'function') {
        return { 
          obj: globalsFinder.appService, 
          func: globalsFinder.appService[funcName] 
        };
      }
      
      
      if (globalsFinder.appService?.mediaHandlerService &&
          typeof globalsFinder.appService.mediaHandlerService[funcName] === 'function') {
        return {
          obj: globalsFinder.appService.mediaHandlerService,
          func: globalsFinder.appService.mediaHandlerService[funcName]
        };
      }
      
      return null;
    }
    
    
    hookFunction(funcName, findFunc, beforeHook) {
      try {
        const found = findFunc();
        if (!found) {
          if (this.config.enableDebugLogs) {
            
          }
          return;
        }
        
        const { obj, func } = found;
        
        
        if (this.hookedFunctions.has(funcName)) {
          return;
        }
        
        
        const hooked = function(...args) {
          try {
            beforeHook(...args);
          } catch (error) {
            console.error(`[State Monitor] Error in ${funcName} hook:`, error);
          }
          
          return func.apply(this, args);
        };
        
        
        this.hookedFunctions.set(funcName, {
          obj,
          original: func,
          hooked,
          propertyName: funcName
        });
        
        
        obj[funcName] = hooked;
        
        
      } catch (error) {
        console.error(`[State Monitor] Failed to hook ${funcName}:`, error);
      }
    }
    
    
    unhookVTFFunctions() {
      for (const [funcName, hookInfo] of this.hookedFunctions) {
        try {
          hookInfo.obj[hookInfo.propertyName] = hookInfo.original;
          
        } catch (error) {
          console.error(`[State Monitor] Failed to unhook ${funcName}:`, error);
        }
      }
      this.hookedFunctions.clear();
    }
    
    
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
    
    
    emit(event, ...args) {
      if (!this.callbacks[event]) {
        return;
      }
      
      
      for (const callback of this.callbacks[event]) {
        try {
          callback(...args);
        } catch (error) {
          console.error(`[State Monitor] Error in ${event} callback:`, error);
        }
      }
    }
    
    
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
    
    
    getTalkingUsers(globals, globalsFinder) {
      
      if (globals.talkingUsers instanceof Map) {
        return globals.talkingUsers;
      }
      
      
      if (globalsFinder.mediaSoupService?.talkingUsers instanceof Map) {
        return globalsFinder.mediaSoupService.talkingUsers;
      }
      
      
      return new Map();
    }
    
    
    hasTalkingUsersChanged(newUsers) {
      const oldUsers = this.lastKnownState.talkingUsers;
      
      
      if (oldUsers.size !== newUsers.size) {
        return true;
      }
      
      
      for (const [userId, userData] of newUsers) {
        if (!oldUsers.has(userId)) {
          return true;
        }
      }
      
      return false;
    }
    
    
    havePreferencesChanged(newPrefs) {
      if (!newPrefs) return false;
      
      const oldPrefs = this.lastKnownState.preferences;
      const oldKeys = Object.keys(oldPrefs);
      const newKeys = Object.keys(newPrefs);
      
      
      if (oldKeys.length !== newKeys.length) {
        return true;
      }
      
      
      for (const key of newKeys) {
        if (oldPrefs[key] !== newPrefs[key]) {
          return true;
        }
      }
      
      return false;
    }
    
    
    normalizeVolume(volume) {
      if (typeof volume !== 'number') {
        return 1.0;
      }
      return Math.max(0, Math.min(1, volume));
    }
    
    
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
    
    
    destroy() {
      this.isDestroyed = true;
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = null;
      }
      this.unhookVTFFunctions();
      for (const event in this.callbacks) {
        this.callbacks[event] = [];
      }
      this.globalsFinder = null;
      this.lastKnownState.talkingUsers.clear();
    }
  }
  
  
  export default VTFStateMonitor;