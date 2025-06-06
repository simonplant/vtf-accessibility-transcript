(() => {
  // src/modules/vtf-globals-finder.js
  var VTFGlobalsFinder = class {
    constructor(options = {}) {
      this.config = {
        defaultInterval: 500,
        defaultMaxRetries: 60,
        ...options
      };
      this.searchPaths = [
        "window.globals",
        "window.appService.globals",
        "window.mediaSoupService",
        "window.app.globals",
        "window.vtf.globals",
        "window.t3.globals"
      ];
      this.functionSignatures = [
        "startListeningToPresenter",
        "stopListeningToPresenter",
        "reconnectAudio",
        "adjustVol"
      ];
      this.globals = null;
      this.mediaSoupService = null;
      this.foundPath = null;
      this.foundMethod = null;
      this.activeTimeout = null;
      this.searchCount = 0;
    }
    /**
     * Wait for VTF globals to be available with retry logic
     * @param {number} maxRetries - Maximum number of retry attempts
     * @param {number} interval - Milliseconds between retries
     * @returns {Promise<boolean>} - True if globals found, false if timeout
     */
    async waitForGlobals(maxRetries = 60, interval = 500) {
      console.log("[VTF Globals] Starting search...");
      this.cleanup();
      this.searchCount = 0;
      for (let i = 0; i < maxRetries; i++) {
        this.searchCount = i;
        if (this.findGlobals()) {
          console.log(`[VTF Globals] Found after ${i * interval}ms using ${this.foundMethod}`);
          return true;
        }
        if (i % 10 === 0 && i > 0) {
          console.log(`[VTF Globals] Still searching... (${i * interval}ms elapsed)`);
        }
        await new Promise((resolve) => {
          this.activeTimeout = setTimeout(resolve, interval);
        });
      }
      console.error(`[VTF Globals] Not found after ${maxRetries * interval}ms (${maxRetries} attempts)`);
      return false;
    }
    /**
     * Synchronously search for globals using all strategies
     * @returns {boolean} - True if globals found
     */
    findGlobals() {
      if (this.globals && this.isValidGlobals(this.globals)) {
        return true;
      }
      for (const path of this.searchPaths) {
        try {
          const obj = this.resolvePath(path);
          if (this.isValidGlobals(obj)) {
            this.globals = obj;
            this.foundPath = path;
            this.foundMethod = "path-resolution";
            console.log("[VTF Globals] Found at path:", path);
            this.findRelatedServices();
            return true;
          }
        } catch (e) {
        }
      }
      if (this.findByFunctions()) {
        this.foundMethod = "function-detection";
        return true;
      }
      if (this.findByJQuery()) {
        this.foundMethod = "jquery-detection";
        return true;
      }
      return false;
    }
    /**
     * Resolve a dot-notation path to an object
     * @param {string} path - Dot-separated path like 'window.app.globals'
     * @returns {*} - The resolved object or undefined
     */
    resolvePath(path) {
      try {
        return path.split(".").reduce((obj, key) => obj?.[key], window);
      } catch (e) {
        return void 0;
      }
    }
    /**
     * Validate if an object looks like VTF globals
     * @param {*} obj - Object to validate
     * @returns {boolean} - True if object has expected VTF properties
     */
    isValidGlobals(obj) {
      if (!obj || typeof obj !== "object") return false;
      const markers = ["audioVolume", "sessData", "preferences", "videoDeviceID"];
      const hasMarkers = markers.some((marker) => obj.hasOwnProperty(marker));
      if (hasMarkers && typeof obj.audioVolume === "number") {
        return obj.audioVolume >= 0 && obj.audioVolume <= 1;
      }
      return hasMarkers;
    }
    /**
     * Search for globals by detecting VTF functions
     * @returns {boolean} - True if globals found via functions
     */
    findByFunctions() {
      for (const funcName of this.functionSignatures) {
        try {
          if (typeof window[funcName] === "function") {
            console.log("[VTF Globals] Found VTF function:", funcName);
            const funcStr = window[funcName].toString();
            if (funcStr.includes("this.globals") || funcStr.includes("globals.")) {
              console.log("[VTF Globals] Globals referenced in function");
              const patterns = [
                "window.appService?.globals",
                "this.appService?.globals",
                "this.globals"
              ];
              for (const pattern of patterns) {
                const obj = this.resolvePath(pattern.replace("this.", "window."));
                if (this.isValidGlobals(obj)) {
                  this.globals = obj;
                  this.foundPath = pattern;
                  console.log("[VTF Globals] Found via function pattern:", pattern);
                  this.findRelatedServices();
                  return true;
                }
              }
            }
          }
        } catch (e) {
        }
      }
      return false;
    }
    /**
     * Search for globals by detecting VTF's jQuery usage
     * @returns {boolean} - True if VTF detected via jQuery
     */
    findByJQuery() {
      try {
        const $ = window.$ || window.jQuery;
        if (typeof $ !== "function") {
          return false;
        }
        const audioElements = $("[id^='msRemAudio-']");
        if (audioElements.length > 0) {
          console.log("[VTF Globals] Found VTF audio elements via jQuery");
          const $body = $("body");
          const appData = $body.data("app") || $body.data("vtf");
          if (appData && this.isValidGlobals(appData.globals)) {
            this.globals = appData.globals;
            this.foundPath = "jQuery-data";
            return true;
          }
          console.log("[VTF Globals] VTF detected but globals not yet accessible");
        }
      } catch (e) {
      }
      return false;
    }
    /**
     * Find related VTF services once globals are located
     */
    findRelatedServices() {
      const servicePaths = [
        "window.mediaSoupService",
        "window.appService.mediaSoupService",
        "window.services.mediaSoup",
        "window.app.mediaSoupService"
      ];
      for (const path of servicePaths) {
        try {
          const service = this.resolvePath(path);
          if (service && typeof service.startListeningToPresenter === "function") {
            this.mediaSoupService = service;
            console.log("[VTF Globals] Found MediaSoup service at:", path);
            break;
          }
        } catch (e) {
        }
      }
      this.findAppService();
      this.findAlertsService();
    }
    /**
     * Find the app service if available
     */
    findAppService() {
      const appPaths = ["window.appService", "window.app"];
      for (const path of appPaths) {
        try {
          const service = this.resolvePath(path);
          if (service && typeof service === "object") {
            this.appService = service;
            console.log("[VTF Globals] Found app service at:", path);
            break;
          }
        } catch (e) {
        }
      }
    }
    /**
     * Find the alerts service if available
     */
    findAlertsService() {
      const alertPaths = ["window.alertsService", "window.appService.alertsService"];
      for (const path of alertPaths) {
        try {
          const service = this.resolvePath(path);
          if (service && typeof service.alert === "function") {
            this.alertsService = service;
            console.log("[VTF Globals] Found alerts service at:", path);
            break;
          }
        } catch (e) {
        }
      }
    }
    /**
     * Get current state for debugging
     * @returns {Object} - Current internal state
     */
    debug() {
      return {
        found: !!this.globals,
        foundPath: this.foundPath,
        foundMethod: this.foundMethod,
        searchCount: this.searchCount,
        hasMediaSoup: !!this.mediaSoupService,
        hasAppService: !!this.appService,
        hasAlertsService: !!this.alertsService,
        globalsProperties: this.globals ? Object.keys(this.globals) : null,
        audioVolume: this.globals?.audioVolume,
        sessionState: this.globals?.sessData?.currentState,
        searchPaths: this.searchPaths,
        functionSignatures: this.functionSignatures
      };
    }
    /**
     * Clean up any active timeouts
     */
    cleanup() {
      if (this.activeTimeout) {
        clearTimeout(this.activeTimeout);
        this.activeTimeout = null;
      }
    }
    /**
     * Destroy the instance and clean up
     */
    destroy() {
      console.log("[VTF Globals] Destroying finder instance");
      this.cleanup();
      this.globals = null;
      this.mediaSoupService = null;
      this.appService = null;
      this.alertsService = null;
    }
  };

  // src/modules/vtf-stream-monitor.js
  var VTFStreamMonitor = class {
    constructor(options = {}) {
      this.config = {
        pollInterval: 50,
        // ms between srcObject checks
        maxPollTime: 5e3,
        // ms before timeout
        streamReadyTimeout: 5e3,
        // ms to wait for stream ready
        enableDebugLogs: false,
        // verbose logging
        ...options
      };
      this.config.maxPolls = Math.ceil(this.config.maxPollTime / this.config.pollInterval);
      this.monitors = /* @__PURE__ */ new Map();
      this.stats = {
        monitorsStarted: 0,
        monitorsSucceeded: 0,
        monitorsFailed: 0,
        streamsValidated: 0,
        totalDetectionTime: 0
      };
      this.activeAnimationFrames = /* @__PURE__ */ new Set();
      this.destroyed = false;
    }
    /**
     * Start monitoring an audio element for stream assignment
     * @param {HTMLAudioElement} element - The audio element to monitor
     * @param {string} userId - Unique identifier for this monitor
     * @param {Function} callback - Called when stream is detected
     * @returns {boolean} - True if monitoring started, false if already monitoring
     */
    startMonitoring(element, userId, callback) {
      if (!element || !(element instanceof HTMLAudioElement)) {
        console.error("[Stream Monitor] Invalid element provided for monitoring");
        return false;
      }
      if (!userId || typeof userId !== "string") {
        console.error("[Stream Monitor] Invalid userId provided");
        return false;
      }
      if (typeof callback !== "function") {
        console.error("[Stream Monitor] Callback must be a function");
        return false;
      }
      if (this.monitors.has(userId)) {
        console.warn(`[Stream Monitor] Already monitoring stream for ${userId}`);
        return false;
      }
      if (element.srcObject && element.srcObject instanceof MediaStream) {
        if (this.config.enableDebugLogs) {
          console.log(`[Stream Monitor] Element ${userId} already has stream, calling callback immediately`);
        }
        try {
          callback(element.srcObject);
          this.stats.monitorsSucceeded++;
        } catch (error) {
          console.error("[Stream Monitor] Error in callback:", error);
        }
        return true;
      }
      const monitor = {
        element,
        userId,
        callback,
        pollInterval: null,
        pollCount: 0,
        startTime: Date.now(),
        maxPolls: this.config.maxPolls
      };
      monitor.pollInterval = setInterval(() => {
        this.checkForStream(monitor);
      }, this.config.pollInterval);
      this.monitors.set(userId, monitor);
      this.stats.monitorsStarted++;
      console.log(`[Stream Monitor] Started monitoring for ${userId}`);
      return true;
    }
    /**
     * Check if element has received a stream
     * @private
     */
    checkForStream(monitor) {
      monitor.pollCount++;
      if (!monitor.element.isConnected) {
        console.warn(`[Stream Monitor] Element ${monitor.userId} removed from DOM, stopping monitor`);
        this.stopMonitoring(monitor.userId);
        this.stats.monitorsFailed++;
        return;
      }
      if (monitor.element.srcObject && monitor.element.srcObject instanceof MediaStream) {
        const detectionTime = Date.now() - monitor.startTime;
        console.log(`[Stream Monitor] Stream detected for ${monitor.userId} after ${detectionTime}ms (${monitor.pollCount} polls)`);
        clearInterval(monitor.pollInterval);
        this.stats.monitorsSucceeded++;
        this.stats.totalDetectionTime += detectionTime;
        this.monitors.delete(monitor.userId);
        try {
          monitor.callback(monitor.element.srcObject);
        } catch (error) {
          console.error("[Stream Monitor] Error in callback:", error);
        }
        return;
      }
      if (monitor.pollCount >= monitor.maxPolls) {
        console.warn(`[Stream Monitor] Timeout waiting for stream ${monitor.userId} after ${this.config.maxPollTime}ms`);
        this.stopMonitoring(monitor.userId);
        this.stats.monitorsFailed++;
        try {
          monitor.callback(null);
        } catch (error) {
          console.error("[Stream Monitor] Error in timeout callback:", error);
        }
      }
      if (this.config.enableDebugLogs && monitor.pollCount % 20 === 0) {
        console.log(`[Stream Monitor] Still waiting for ${monitor.userId} (${monitor.pollCount}/${monitor.maxPolls})`);
      }
    }
    /**
     * Wait for a MediaStream to be ready for capture
     * @param {MediaStream} stream - The stream to validate
     * @returns {Promise<MediaStream>} - Resolves when stream is ready
     */
    async waitForStreamReady(stream) {
      if (!stream || !(stream instanceof MediaStream)) {
        throw new Error("Invalid stream provided");
      }
      return new Promise((resolve, reject) => {
        const startTime = Date.now();
        let animationFrameId = null;
        let timeoutId = null;
        let checkCount = 0;
        timeoutId = setTimeout(() => {
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            this.activeAnimationFrames.delete(animationFrameId);
          }
          reject(new Error(`Stream ready timeout after ${this.config.streamReadyTimeout}ms`));
        }, this.config.streamReadyTimeout);
        const checkReady = () => {
          checkCount++;
          if (this.destroyed) {
            clearTimeout(timeoutId);
            reject(new Error("Monitor destroyed"));
            return;
          }
          if (!stream.active) {
            clearTimeout(timeoutId);
            reject(new Error("Stream inactive"));
            return;
          }
          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length === 0) {
            clearTimeout(timeoutId);
            reject(new Error("No audio tracks in stream"));
            return;
          }
          const track = audioTracks[0];
          if (this.config.enableDebugLogs && checkCount % 60 === 0) {
            console.log(`[Stream Monitor] Checking stream ready: state=${track.readyState}, muted=${track.muted}`);
          }
          if (track.readyState === "live" && !track.muted) {
            clearTimeout(timeoutId);
            this.activeAnimationFrames.delete(animationFrameId);
            const readyTime = Date.now() - startTime;
            console.log(`[Stream Monitor] Stream ready after ${readyTime}ms`);
            this.stats.streamsValidated++;
            resolve(stream);
          } else {
            animationFrameId = requestAnimationFrame(checkReady);
            this.activeAnimationFrames.add(animationFrameId);
          }
        };
        checkReady();
      });
    }
    /**
     * Stop monitoring a specific user
     * @param {string} userId - The user to stop monitoring
     * @returns {boolean} - True if monitor was active and stopped
     */
    stopMonitoring(userId) {
      const monitor = this.monitors.get(userId);
      if (!monitor) {
        return false;
      }
      if (monitor.pollInterval) {
        clearInterval(monitor.pollInterval);
      }
      this.monitors.delete(userId);
      console.log(`[Stream Monitor] Stopped monitoring for ${userId}`);
      return true;
    }
    /**
     * Stop all active monitors
     * @returns {number} - Number of monitors stopped
     */
    stopAll() {
      const count = this.monitors.size;
      for (const [userId] of this.monitors) {
        this.stopMonitoring(userId);
      }
      console.log(`[Stream Monitor] Stopped all ${count} monitors`);
      return count;
    }
    /**
     * Check if currently monitoring a user
     * @param {string} userId - The user to check
     * @returns {boolean} - True if actively monitoring
     */
    isMonitoring(userId) {
      return this.monitors.has(userId);
    }
    /**
     * Get number of active monitors
     * @returns {number} - Count of active monitors
     */
    getMonitorCount() {
      return this.monitors.size;
    }
    /**
     * Get debug information about current state
     * @returns {Object} - Debug information
     */
    debug() {
      const monitors = Array.from(this.monitors.entries()).map(([userId, monitor]) => ({
        userId,
        pollCount: monitor.pollCount,
        elapsed: Date.now() - monitor.startTime,
        hasStream: !!monitor.element.srcObject,
        elementConnected: monitor.element.isConnected
      }));
      return {
        config: { ...this.config },
        activeMonitors: monitors,
        monitorCount: this.monitors.size,
        stats: { ...this.stats },
        averageDetectionTime: this.stats.monitorsSucceeded > 0 ? Math.round(this.stats.totalDetectionTime / this.stats.monitorsSucceeded) : 0,
        activeAnimationFrames: this.activeAnimationFrames.size,
        destroyed: this.destroyed
      };
    }
    /**
     * Clean up all resources
     */
    destroy() {
      console.log("[Stream Monitor] Destroying monitor instance");
      this.destroyed = true;
      this.stopAll();
      for (const frameId of this.activeAnimationFrames) {
        cancelAnimationFrame(frameId);
      }
      this.activeAnimationFrames.clear();
      this.monitors.clear();
    }
  };

  // src/modules/vtf-state-monitor.js
  var VTFStateMonitor = class {
    constructor(options = {}) {
      this.config = {
        defaultSyncInterval: 1e3,
        // ms between state checks
        volumeThreshold: 0.01,
        // minimum volume change to trigger event
        enableDebugLogs: false,
        ...options
      };
      this.lastKnownState = {
        volume: 1,
        sessionState: "unknown",
        talkingUsers: /* @__PURE__ */ new Map(),
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
      this.hookedFunctions = /* @__PURE__ */ new Map();
      this.isDestroyed = false;
      this.syncCount = 0;
      this.errorCount = 0;
      this.globalsFinder = null;
    }
    /**
     * Start synchronizing with VTF state
     * @param {Object} globalsFinder - VTFGlobalsFinder instance
     * @param {number} interval - Sync interval in milliseconds
     * @returns {boolean} - True if sync started successfully
     */
    startSync(globalsFinder, interval = 1e3) {
      if (!globalsFinder || typeof globalsFinder !== "object") {
        console.error("[State Monitor] Invalid globalsFinder provided");
        return false;
      }
      if (this.syncInterval) {
        console.warn("[State Monitor] Sync already running, stopping previous sync");
        this.stopSync();
      }
      console.log("[State Monitor] Starting synchronization");
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
    /**
     * Stop synchronization
     */
    stopSync() {
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = null;
        console.log("[State Monitor] Synchronization stopped");
      }
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
            console.log("[State Monitor] No globals available for sync");
          }
          return;
        }
        this.syncCount++;
        let hasChanges = false;
        const currentVolume = this.normalizeVolume(globals.audioVolume);
        if (Math.abs(currentVolume - this.lastKnownState.volume) > this.config.volumeThreshold) {
          const oldVolume = this.lastKnownState.volume;
          this.lastKnownState.volume = currentVolume;
          console.log(`[State Monitor] Volume changed: ${oldVolume.toFixed(2)} \u2192 ${currentVolume.toFixed(2)}`);
          this.emit("onVolumeChanged", currentVolume, oldVolume);
          hasChanges = true;
        }
        const sessionState = globals.sessData?.currentState || "unknown";
        if (sessionState !== this.lastKnownState.sessionState) {
          const oldState = this.lastKnownState.sessionState;
          this.lastKnownState.sessionState = sessionState;
          console.log(`[State Monitor] Session state changed: ${oldState} \u2192 ${sessionState}`);
          this.emit("onSessionStateChanged", sessionState, oldState);
          hasChanges = true;
        }
        const talkingUsers = this.getTalkingUsers(globals, globalsFinder);
        if (this.hasTalkingUsersChanged(talkingUsers)) {
          const oldUsers = new Map(this.lastKnownState.talkingUsers);
          this.lastKnownState.talkingUsers = new Map(talkingUsers);
          console.log(`[State Monitor] Talking users changed: ${oldUsers.size} \u2192 ${talkingUsers.size}`);
          this.emit("onTalkingUsersChanged", talkingUsers, oldUsers);
          hasChanges = true;
        }
        if (this.havePreferencesChanged(globals.preferences)) {
          const oldPrefs = { ...this.lastKnownState.preferences };
          this.lastKnownState.preferences = { ...globals.preferences };
          console.log("[State Monitor] Preferences changed");
          this.emit("onPreferencesChanged", this.lastKnownState.preferences, oldPrefs);
          hasChanges = true;
        }
        this.lastKnownState.lastSync = Date.now();
        if (this.config.enableDebugLogs && hasChanges) {
          console.log("[State Monitor] Sync completed with changes");
        }
      } catch (error) {
        this.errorCount++;
        console.error("[State Monitor] Error during sync:", error);
        this.emit("onSyncError", error);
      }
    }
    /**
     * Hook into VTF functions to detect events
     * @param {Object} globalsFinder - VTFGlobalsFinder instance
     */
    hookVTFFunctions(globalsFinder) {
      this.hookFunction(
        "reconnectAudio",
        () => this.findFunction("reconnectAudio", globalsFinder),
        () => {
          console.log("[State Monitor] reconnectAudio called");
          this.lastKnownState.reconnectCount++;
          this.emit("onReconnect", this.lastKnownState.reconnectCount);
        }
      );
      this.hookFunction(
        "adjustVol",
        () => this.findFunction("adjustVol", globalsFinder),
        (event) => {
          if (this.config.enableDebugLogs) {
            console.log("[State Monitor] adjustVol called");
          }
        }
      );
      this.hookFunction(
        "mute",
        () => this.findFunction("mute", globalsFinder),
        () => {
          console.log("[State Monitor] mute called");
          if (this.globalsFinder) {
            setTimeout(() => this.syncState(this.globalsFinder), 50);
          }
        }
      );
      this.hookFunction(
        "unMute",
        () => this.findFunction("unMute", globalsFinder),
        () => {
          console.log("[State Monitor] unMute called");
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
      if (typeof window[funcName] === "function") {
        return { obj: window, func: window[funcName] };
      }
      if (globalsFinder.mediaSoupService && typeof globalsFinder.mediaSoupService[funcName] === "function") {
        return { obj: globalsFinder.mediaSoupService, func: globalsFinder.mediaSoupService[funcName] };
      }
      if (globalsFinder.appService && typeof globalsFinder.appService[funcName] === "function") {
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
      if (typeof callback !== "function") {
        console.error("[State Monitor] Callback must be a function");
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
      if (globals.talkingUsers instanceof Map) {
        return globals.talkingUsers;
      }
      if (globalsFinder.mediaSoupService?.talkingUsers instanceof Map) {
        return globalsFinder.mediaSoupService.talkingUsers;
      }
      return /* @__PURE__ */ new Map();
    }
    /**
     * Check if talking users have changed
     * @private
     */
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
    /**
     * Check if preferences have changed
     * @private
     */
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
    /**
     * Normalize volume value
     * @private
     */
    normalizeVolume(volume) {
      if (typeof volume !== "number") {
        return 1;
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
      console.log("[State Monitor] Destroying state monitor");
      this.isDestroyed = true;
      this.stopSync();
      for (const event in this.callbacks) {
        this.callbacks[event] = [];
      }
      this.globalsFinder = null;
      this.lastKnownState.talkingUsers.clear();
    }
  };

  // src/modules/vtf-audio-worklet-node.js
  var VTFAudioWorkletNode = class {
    constructor(context, userId, options = {}) {
      if (!context || !(context instanceof AudioContext)) {
        throw new Error("[Audio Worklet] Invalid AudioContext provided");
      }
      if (!userId || typeof userId !== "string") {
        throw new Error("[Audio Worklet] Invalid userId provided");
      }
      this.context = context;
      this.userId = userId;
      this.options = {
        bufferSize: 4096,
        silenceThreshold: 1e-3,
        workletPath: "audio-worklet.js",
        ...options
      };
      this.isInitialized = false;
      this.node = null;
      this.audioDataCallback = null;
      this.statsCallback = null;
      this.stats = {
        initialized: false,
        messagesReceived: 0,
        audioChunksReceived: 0,
        lastMessageTime: null,
        initTime: null
      };
      this.lastError = null;
    }
    /**
     * Initialize the worklet and create the processing node
     * @returns {Promise<void>}
     */
    async initialize() {
      if (this.isInitialized) {
        console.warn("[Audio Worklet] Already initialized");
        return;
      }
      console.log(`[Audio Worklet] Initializing for user: ${this.userId}`);
      try {
        if (!this.context.audioWorklet) {
          throw new Error("AudioWorklet not supported in this browser");
        }
        let workletUrl = this.options.workletPath;
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
          workletUrl = chrome.runtime.getURL(`workers/${this.options.workletPath}`);
        }
        console.log("[Audio Worklet] Loading worklet from:", workletUrl);
        await this.context.audioWorklet.addModule(workletUrl);
        console.log("[Audio Worklet] Worklet module loaded successfully");
        this.node = new AudioWorkletNode(this.context, "vtf-audio-processor", {
          processorOptions: {
            userId: this.userId,
            bufferSize: this.options.bufferSize,
            silenceThreshold: this.options.silenceThreshold
          },
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1,
          channelCountMode: "explicit",
          channelInterpretation: "speakers"
        });
        this.node.port.onmessage = (event) => {
          this.handleWorkletMessage(event.data);
        };
        this.isInitialized = true;
        this.stats.initTime = Date.now();
        console.log(`[Audio Worklet] Initialized successfully for user: ${this.userId}`);
      } catch (error) {
        this.lastError = error;
        console.error("[Audio Worklet] Initialization failed:", error);
        throw error;
      }
    }
    /**
     * Connect the worklet node to an audio destination
     * @param {AudioNode} destination - The node to connect to
     */
    connect(destination) {
      if (!this.isInitialized || !this.node) {
        throw new Error("[Audio Worklet] Not initialized");
      }
      this.node.connect(destination);
      console.log("[Audio Worklet] Connected to audio graph");
    }
    /**
     * Disconnect the worklet node
     */
    disconnect() {
      if (!this.node) {
        return;
      }
      try {
        this.node.disconnect();
        console.log("[Audio Worklet] Disconnected from audio graph");
      } catch (error) {
        console.warn("[Audio Worklet] Disconnect warning:", error.message);
      }
    }
    /**
     * Set callback for audio data chunks
     * @param {Function} callback - Function to call with audio data
     */
    onAudioData(callback) {
      if (typeof callback !== "function") {
        throw new Error("[Audio Worklet] Callback must be a function");
      }
      this.audioDataCallback = callback;
    }
    /**
     * Set callback for statistics updates
     * @param {Function} callback - Function to call with stats
     */
    onStats(callback) {
      if (typeof callback !== "function") {
        throw new Error("[Audio Worklet] Callback must be a function");
      }
      this.statsCallback = callback;
    }
    /**
     * Request statistics from the worklet
     * @returns {Promise<Object>} - Statistics from the processor
     */
    async getStats() {
      if (!this.isInitialized || !this.node) {
        return this.stats;
      }
      return new Promise((resolve) => {
        const originalCallback = this.statsCallback;
        this.statsCallback = (stats) => {
          this.statsCallback = originalCallback;
          resolve({
            ...this.stats,
            processor: stats
          });
        };
        this.node.port.postMessage({ command: "getStats" });
        setTimeout(() => {
          this.statsCallback = originalCallback;
          resolve(this.stats);
        }, 1e3);
      });
    }
    /**
     * Update processor configuration
     * @param {Object} config - New configuration values
     */
    updateConfig(config) {
      if (!this.isInitialized || !this.node) {
        throw new Error("[Audio Worklet] Not initialized");
      }
      this.node.port.postMessage({
        command: "updateConfig",
        config
      });
      Object.assign(this.options, config);
    }
    /**
     * Force flush any buffered audio
     */
    flush() {
      if (!this.isInitialized || !this.node) {
        return;
      }
      this.node.port.postMessage({ command: "flush" });
    }
    /**
     * Handle messages from the worklet
     * @private
     */
    handleWorkletMessage(data) {
      this.stats.messagesReceived++;
      this.stats.lastMessageTime = Date.now();
      switch (data.type) {
        case "initialized":
          this.stats.initialized = true;
          console.log(`[Audio Worklet] Processor initialized for ${data.userId}`);
          break;
        case "audioData":
          this.stats.audioChunksReceived++;
          if (this.audioDataCallback) {
            try {
              this.audioDataCallback({
                userId: data.userId,
                samples: data.samples,
                timestamp: data.timestamp,
                maxSample: data.maxSample,
                rms: data.rms,
                chunkIndex: data.chunkIndex
              });
            } catch (error) {
              console.error("[Audio Worklet] Error in audio callback:", error);
            }
          }
          break;
        case "stats":
          if (this.statsCallback) {
            try {
              this.statsCallback(data);
            } catch (error) {
              console.error("[Audio Worklet] Error in stats callback:", error);
            }
          }
          break;
        default:
          console.warn(`[Audio Worklet] Unknown message type: ${data.type}`);
      }
    }
    /**
     * Get debug information
     * @returns {Object} - Debug state
     */
    debug() {
      return {
        userId: this.userId,
        isInitialized: this.isInitialized,
        hasNode: !!this.node,
        options: { ...this.options },
        stats: { ...this.stats },
        lastError: this.lastError ? this.lastError.message : null,
        contextState: this.context ? this.context.state : "no-context",
        sampleRate: this.context ? this.context.sampleRate : null
      };
    }
    /**
     * Destroy the worklet node and clean up resources
     */
    destroy() {
      console.log(`[Audio Worklet] Destroying node for user: ${this.userId}`);
      if (this.node) {
        this.node.port.postMessage({ command: "stop" });
        this.disconnect();
        this.node = null;
      }
      this.audioDataCallback = null;
      this.statsCallback = null;
      this.isInitialized = false;
      console.log("[Audio Worklet] Destroyed successfully");
    }
  };

  // src/modules/vtf-audio-capture.js
  var AudioDataTransfer = class {
    sendAudioData(userId, samples) {
      console.log(`[Audio Transfer] Would send ${samples.length} samples for ${userId}`);
    }
  };
  var VTFAudioCapture = class {
    constructor(options = {}) {
      this.config = {
        sampleRate: 16e3,
        // Optimal for Whisper
        bufferSize: 4096,
        // Samples per chunk
        silenceThreshold: 1e-3,
        // Minimum amplitude to process
        latencyHint: "interactive",
        // Balance latency vs power
        maxCaptures: 50,
        // Prevent memory issues
        workletPath: "audio-worklet.js",
        ...options
      };
      this.audioContext = null;
      this.workletReady = false;
      this.captures = /* @__PURE__ */ new Map();
      this.dataTransfer = null;
      this.stats = {
        capturesStarted: 0,
        capturesStopped: 0,
        workletUsed: 0,
        fallbackUsed: 0,
        errors: 0
      };
      this.isInitialized = false;
      this.volumeSyncInterval = null;
    }
    /**
     * Initialize audio context and capabilities
     * @returns {Promise<void>}
     */
    async initialize() {
      if (this.isInitialized) {
        console.warn("[Audio Capture] Already initialized");
        return;
      }
      console.log("[Audio Capture] Initializing...");
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: this.config.sampleRate,
          latencyHint: this.config.latencyHint
        });
        console.log(`[Audio Capture] Created AudioContext: ${this.audioContext.state}, ${this.audioContext.sampleRate}Hz`);
        if (this.audioContext.state === "suspended") {
          await this.audioContext.resume();
          console.log("[Audio Capture] AudioContext resumed");
        }
        this.dataTransfer = new AudioDataTransfer();
        await this.loadAudioWorklet();
        this.startVolumeSync();
        this.isInitialized = true;
        console.log("[Audio Capture] Initialization complete");
      } catch (error) {
        console.error("[Audio Capture] Initialization failed:", error);
        this.stats.errors++;
        throw error;
      }
    }
    /**
     * Attempt to load AudioWorklet module
     * @private
     */
    async loadAudioWorklet() {
      try {
        if (!this.audioContext.audioWorklet) {
          console.warn("[Audio Capture] AudioWorklet not supported");
          this.workletReady = false;
          return;
        }
        let workletUrl = this.config.workletPath;
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
          workletUrl = chrome.runtime.getURL(`workers/${this.config.workletPath}`);
        }
        console.log("[Audio Capture] Loading AudioWorklet from:", workletUrl);
        await this.audioContext.audioWorklet.addModule(workletUrl);
        this.workletReady = true;
        console.log("[Audio Capture] AudioWorklet loaded successfully");
      } catch (error) {
        console.warn("[Audio Capture] AudioWorklet failed, will use ScriptProcessor fallback:", error);
        this.workletReady = false;
      }
    }
    /**
     * Start capturing audio from a VTF element
     * @param {HTMLAudioElement} element - The audio element
     * @param {MediaStream} stream - The MediaStream to capture
     * @param {string} userId - Unique identifier for this capture
     * @returns {Promise<void>}
     */
    async captureElement(element, stream, userId) {
      if (!element || !(element instanceof HTMLAudioElement)) {
        throw new Error("[Audio Capture] Invalid audio element");
      }
      if (!stream || !(stream instanceof MediaStream)) {
        throw new Error("[Audio Capture] Invalid MediaStream");
      }
      if (!userId || typeof userId !== "string") {
        throw new Error("[Audio Capture] Invalid userId");
      }
      console.log(`[Audio Capture] Starting capture for ${userId}`);
      if (this.captures.has(userId)) {
        console.warn(`[Audio Capture] Already capturing ${userId}`);
        return;
      }
      if (this.captures.size >= this.config.maxCaptures) {
        throw new Error(`[Audio Capture] Maximum captures (${this.config.maxCaptures}) reached`);
      }
      if (!this.isInitialized) {
        await this.initialize();
      }
      try {
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          throw new Error("No audio tracks in stream");
        }
        const track = audioTracks[0];
        console.log(`[Audio Capture] Using track: ${track.label}, state: ${track.readyState}`);
        const source = this.audioContext.createMediaStreamSource(stream);
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = this.getVTFVolume();
        let processor;
        let processorType;
        if (this.workletReady) {
          processor = await this.createWorkletProcessor(userId);
          processorType = "worklet";
          this.stats.workletUsed++;
        } else {
          processor = this.createScriptProcessor(userId);
          processorType = "script";
          this.stats.fallbackUsed++;
        }
        source.connect(gainNode);
        gainNode.connect(processor);
        processor.connect(this.audioContext.destination);
        const capture = {
          element,
          stream,
          track,
          source,
          gainNode,
          processor,
          processorType,
          startTime: Date.now(),
          sampleCount: 0,
          chunkCount: 0
        };
        this.captures.set(userId, capture);
        this.stats.capturesStarted++;
        this.setupTrackMonitoring(track, userId);
        console.log(`[Audio Capture] Capture started for ${userId} using ${processorType}`);
      } catch (error) {
        console.error(`[Audio Capture] Failed to capture ${userId}:`, error);
        this.stats.errors++;
        throw error;
      }
    }
    /**
     * Create AudioWorklet processor
     * @private
     */
    async createWorkletProcessor(userId) {
      const workletNode = new VTFAudioWorkletNode(this.audioContext, userId, {
        bufferSize: this.config.bufferSize,
        silenceThreshold: this.config.silenceThreshold
      });
      await workletNode.initialize();
      workletNode.onAudioData((data) => {
        this.handleAudioData(userId, data);
      });
      return workletNode.node;
    }
    /**
     * Create ScriptProcessor fallback
     * @private
     */
    createScriptProcessor(userId) {
      console.log(`[Audio Capture] Creating ScriptProcessor for ${userId}`);
      const processor = this.audioContext.createScriptProcessor(
        this.config.bufferSize,
        1,
        // Input channels
        1
        // Output channels
      );
      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        let maxSample = 0;
        for (let i = 0; i < inputData.length; i++) {
          const absSample = Math.abs(inputData[i]);
          if (absSample > maxSample) {
            maxSample = absSample;
          }
        }
        if (maxSample < this.config.silenceThreshold) {
          return;
        }
        this.handleAudioData(userId, {
          samples: Array.from(inputData),
          timestamp: event.playbackTime || this.audioContext.currentTime,
          maxSample
        });
      };
      return processor;
    }
    /**
     * Handle incoming audio data
     * @private
     */
    handleAudioData(userId, data) {
      const capture = this.captures.get(userId);
      if (!capture) {
        console.warn(`[Audio Capture] No capture found for ${userId}`);
        return;
      }
      capture.sampleCount += data.samples.length;
      capture.chunkCount++;
      if (this.dataTransfer) {
        this.dataTransfer.sendAudioData(userId, data.samples);
      }
      if (capture.chunkCount % 10 === 0) {
        const duration = (Date.now() - capture.startTime) / 1e3;
        const avgChunkRate = capture.chunkCount / duration;
        console.log(`[Audio Capture] ${userId}: ${capture.chunkCount} chunks, ${avgChunkRate.toFixed(1)} chunks/sec`);
      }
    }
    /**
     * Set up track state monitoring
     * @private
     */
    setupTrackMonitoring(track, userId) {
      track.onended = () => {
        console.log(`[Audio Capture] Track ended for ${userId}`);
        this.stopCapture(userId);
      };
      track.onmute = () => {
        console.log(`[Audio Capture] Track muted for ${userId}`);
        const capture = this.captures.get(userId);
        if (capture) {
          capture.muted = true;
        }
      };
      track.onunmute = () => {
        console.log(`[Audio Capture] Track unmuted for ${userId}`);
        const capture = this.captures.get(userId);
        if (capture) {
          capture.muted = false;
        }
      };
    }
    /**
     * Stop capturing for a specific user
     * @param {string} userId - The user to stop capturing
     * @returns {boolean} - True if capture was active and stopped
     */
    stopCapture(userId) {
      const capture = this.captures.get(userId);
      if (!capture) {
        return false;
      }
      console.log(`[Audio Capture] Stopping capture for ${userId}`);
      try {
        capture.source.disconnect();
        capture.gainNode.disconnect();
        if (capture.processorType === "worklet") {
          const workletNodes = Array.from(this.captures.values()).filter((c) => c.processorType === "worklet" && c.processor === capture.processor);
          if (workletNodes.length === 1) {
            capture.processor.port.postMessage({ command: "stop" });
          }
        }
        capture.processor.disconnect();
        const duration = (Date.now() - capture.startTime) / 1e3;
        console.log(`[Audio Capture] Stopped ${userId}: ${capture.chunkCount} chunks over ${duration.toFixed(1)}s`);
      } catch (error) {
        console.error(`[Audio Capture] Error stopping ${userId}:`, error);
      }
      this.captures.delete(userId);
      this.stats.capturesStopped++;
      return true;
    }
    /**
     * Stop all active captures
     * @returns {number} - Number of captures stopped
     */
    stopAll() {
      console.log("[Audio Capture] Stopping all captures");
      const userIds = Array.from(this.captures.keys());
      let stopped = 0;
      for (const userId of userIds) {
        if (this.stopCapture(userId)) {
          stopped++;
        }
      }
      console.log(`[Audio Capture] Stopped ${stopped} captures`);
      return stopped;
    }
    /**
     * Get current VTF volume from various possible locations
     * @returns {number} - Volume between 0.0 and 1.0
     */
    getVTFVolume() {
      const volume = window.globals?.audioVolume ?? window.appService?.globals?.audioVolume ?? window.vtf?.audioVolume ?? 1;
      return Math.max(0, Math.min(1, volume));
    }
    /**
     * Update volume for all active captures
     * @param {number} volume - New volume (0.0 to 1.0)
     */
    updateVolume(volume) {
      const normalizedVolume = Math.max(0, Math.min(1, volume));
      console.log(`[Audio Capture] Updating volume to ${normalizedVolume}`);
      for (const [userId, capture] of this.captures) {
        if (capture.gainNode) {
          capture.gainNode.gain.value = normalizedVolume;
        }
      }
    }
    /**
     * Start periodic volume synchronization
     * @private
     */
    startVolumeSync() {
      this.volumeSyncInterval = setInterval(() => {
        const currentVolume = this.getVTFVolume();
        for (const capture of this.captures.values()) {
          if (capture.gainNode && Math.abs(capture.gainNode.gain.value - currentVolume) > 0.01) {
            capture.gainNode.gain.value = currentVolume;
          }
        }
      }, 1e3);
    }
    /**
     * Get number of active captures
     * @returns {number}
     */
    getCaptureCount() {
      return this.captures.size;
    }
    /**
     * Get statistics for a specific capture
     * @param {string} userId - The user to get stats for
     * @returns {Object|null} - Capture statistics or null
     */
    getCaptureStats(userId) {
      const capture = this.captures.get(userId);
      if (!capture) {
        return null;
      }
      const duration = (Date.now() - capture.startTime) / 1e3;
      return {
        userId,
        processorType: capture.processorType,
        duration,
        sampleCount: capture.sampleCount,
        chunkCount: capture.chunkCount,
        chunksPerSecond: capture.chunkCount / duration,
        trackState: capture.track.readyState,
        muted: capture.track.muted || capture.muted || false
      };
    }
    /**
     * Get statistics for all captures
     * @returns {Object} - Overall statistics
     */
    getAllStats() {
      const captureStats = Array.from(this.captures.keys()).map(
        (userId) => this.getCaptureStats(userId)
      );
      return {
        ...this.stats,
        contextState: this.audioContext?.state || "not-created",
        sampleRate: this.audioContext?.sampleRate || 0,
        workletReady: this.workletReady,
        activeCaptures: this.captures.size,
        captures: captureStats,
        currentVolume: this.getVTFVolume()
      };
    }
    /**
     * Get debug information
     * @returns {Object} - Debug state
     */
    debug() {
      const captureDebug = {};
      for (const [userId, capture] of this.captures) {
        captureDebug[userId] = {
          processorType: capture.processorType,
          duration: (Date.now() - capture.startTime) / 1e3,
          chunks: capture.chunkCount,
          element: {
            id: capture.element.id,
            paused: capture.element.paused,
            volume: capture.element.volume
          },
          stream: {
            id: capture.stream.id,
            active: capture.stream.active
          },
          track: {
            label: capture.track.label,
            readyState: capture.track.readyState,
            muted: capture.track.muted
          }
        };
      }
      return {
        isInitialized: this.isInitialized,
        config: { ...this.config },
        stats: this.getAllStats(),
        captures: captureDebug,
        audioContext: {
          state: this.audioContext?.state,
          sampleRate: this.audioContext?.sampleRate,
          currentTime: this.audioContext?.currentTime,
          baseLatency: this.audioContext?.baseLatency
        }
      };
    }
    /**
     * Clean up and destroy the capture system
     */
    destroy() {
      console.log("[Audio Capture] Destroying capture system");
      this.stopAll();
      if (this.volumeSyncInterval) {
        clearInterval(this.volumeSyncInterval);
        this.volumeSyncInterval = null;
      }
      if (this.audioContext && this.audioContext.state !== "closed") {
        this.audioContext.close();
        console.log("[Audio Capture] Audio context closed");
      }
      this.audioContext = null;
      this.dataTransfer = null;
      this.isInitialized = false;
      console.log("[Audio Capture] Destroyed successfully");
    }
  };

  // src/content.js
  var VTFAudioExtension = class {
    constructor() {
      this.globalsFinder = new VTFGlobalsFinder();
      this.audioCapture = new VTFAudioCapture();
      this.streamMonitor = new VTFStreamMonitor();
      this.stateMonitor = new VTFStateMonitor();
      this.audioElements = /* @__PURE__ */ new Map();
      this.activeCaptures = /* @__PURE__ */ new Map();
      this.pendingStreams = /* @__PURE__ */ new Map();
      this.config = {
        autoStart: true,
        // Auto-start on page load
        globalsTimeout: 3e4,
        // Max wait for VTF globals
        enableDebugLogs: false,
        retryInterval: 5e3,
        // Retry interval for failed operations
        notificationDuration: 5e3
        // How long notifications show
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
      this.legacyMessageMap = {
        "audioData": "audioChunk",
        "start_capture": "startCapture",
        "stop_capture": "stopCapture",
        "getTranscriptions": "getStatus"
      };
    }
    /**
     * Initialize the extension
     */
    async init() {
      console.log("[VTF Extension] Initializing...");
      try {
        console.log("[VTF Extension] Phase 1: Waiting for VTF globals...");
        const globalsFound = await this.globalsFinder.waitForGlobals(
          Math.floor(this.config.globalsTimeout / 500),
          500
        );
        if (!globalsFound) {
          throw new Error("VTF globals not found after timeout");
        }
        console.log("[VTF Extension] VTF globals found");
        console.log("[VTF Extension] Phase 2: Initializing audio system...");
        await this.audioCapture.initialize();
        console.log("[VTF Extension] Phase 3: Setting up state monitoring...");
        this.stateMonitor.startSync(this.globalsFinder, 1e3);
        console.log("[VTF Extension] Phase 4: Setting up event handlers...");
        this.setupEventHandlers();
        console.log("[VTF Extension] Phase 5: Setting up DOM observer...");
        this.setupDOMObserver();
        console.log("[VTF Extension] Phase 6: Scanning existing elements...");
        this.scanExistingElements();
        console.log("[VTF Extension] Phase 7: Setting up message handlers...");
        this.setupMessageHandlers();
        const settings = await this.loadSettings();
        if (settings.autoStart !== false && this.config.autoStart) {
          console.log("[VTF Extension] Phase 8: Auto-starting capture...");
          await this.startCapture();
        }
        this.isInitialized = true;
        console.log("[VTF Extension] Initialization complete");
        this.sendMessage({
          type: "extensionInitialized",
          status: this.getStatus()
        });
      } catch (error) {
        console.error("[VTF Extension] Initialization failed:", error);
        this.initializationError = error.message;
        this.notifyUser(`VTF Extension: ${error.message}`);
        if (error.message.includes("VTF globals")) {
          setTimeout(() => this.retryInitialization(), this.config.retryInterval);
        }
      }
    }
    /**
     * Retry initialization after failure
     */
    async retryInitialization() {
      console.log("[VTF Extension] Retrying initialization...");
      this.isInitialized = false;
      this.initializationError = null;
      this.cleanup();
      await this.init();
    }
    /**
     * Set up event handlers for module coordination
     */
    setupEventHandlers() {
      this.stateMonitor.on("onVolumeChanged", (newVolume, oldVolume) => {
        console.log(`[VTF Extension] Volume changed: ${oldVolume} \u2192 ${newVolume}`);
        this.audioCapture.updateVolume(newVolume);
        this.sendMessage({
          type: "volumeChanged",
          volume: newVolume
        });
      });
      this.stateMonitor.on("onSessionStateChanged", (newState, oldState) => {
        console.log(`[VTF Extension] Session state: ${oldState} \u2192 ${newState}`);
        if (newState === "closed") {
          this.handleSessionClosed();
        } else if (newState === "open" && oldState === "closed") {
          this.handleSessionOpened();
        }
        this.sendMessage({
          type: "sessionStateChanged",
          state: newState
        });
      });
      this.stateMonitor.on("onReconnect", (count) => {
        console.log(`[VTF Extension] VTF reconnect #${count}`);
        this.metrics.reconnects++;
        this.handleReconnect();
      });
      this.stateMonitor.on("onTalkingUsersChanged", (newUsers, oldUsers) => {
        console.log(`[VTF Extension] Talking users changed: ${oldUsers.size} \u2192 ${newUsers.size}`);
        for (const [userId] of oldUsers) {
          if (!newUsers.has(userId)) {
            this.handleUserLeft(userId);
          }
        }
      });
      this.audioCapture.on("captureStarted", (userId) => {
        console.log(`[VTF Extension] Audio capture started for ${userId}`);
        this.metrics.capturesStarted++;
      });
      this.audioCapture.on("captureStopped", (userId) => {
        console.log(`[VTF Extension] Audio capture stopped for ${userId}`);
      });
      this.audioCapture.on("captureError", (userId, error) => {
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
      const target = document.getElementById("topRoomDiv") || document.body;
      this.domObserver.observe(target, {
        childList: true,
        subtree: true
      });
      console.log(`[VTF Extension] DOM observer started on ${target.id || "document.body"}`);
    }
    /**
     * Check if a node is a VTF audio element
     */
    isVTFAudioElement(node) {
      return node.nodeType === Node.ELEMENT_NODE && node.nodeName === "AUDIO" && node.id && node.id.startsWith("msRemAudio-");
    }
    /**
     * Handle new audio element
     */
    handleNewAudioElement(element) {
      const userId = element.id.replace("msRemAudio-", "");
      console.log(`[VTF Extension] New audio element detected: ${userId}`);
      this.audioElements.set(userId, element);
      if (!this.isCapturing) {
        console.log(`[VTF Extension] Not capturing, skipping ${userId}`);
        return;
      }
      if (this.pendingStreams.has(userId)) {
        console.log(`[VTF Extension] Already monitoring ${userId}`);
        return;
      }
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
      console.log(`[VTF Extension] Stream ${stream ? "assigned" : "timeout"} for ${userId}`);
      if (!stream) {
        console.warn(`[VTF Extension] No stream detected for ${userId}`);
        return;
      }
      if (!this.isCapturing) {
        console.log(`[VTF Extension] Capture stopped, not processing ${userId}`);
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
          type: "userJoined",
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
      const userId = element.id.replace("msRemAudio-", "");
      console.log(`[VTF Extension] Audio element removed: ${userId}`);
      this.handleUserLeft(userId);
    }
    /**
     * Handle user leaving
     */
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
          type: "userLeft",
          userId,
          speakerName,
          timestamp: Date.now()
        });
      }
      this.audioElements.delete(userId);
    }
    /**
     * Handle VTF reconnect
     */
    handleReconnect() {
      console.log("[VTF Extension] Handling VTF reconnect - clearing all state");
      this.audioCapture.stopAll();
      this.activeCaptures.clear();
      this.audioElements.clear();
      this.pendingStreams.clear();
      this.streamMonitor.stopAll();
      this.sendMessage({
        type: "reconnectAudio",
        timestamp: Date.now()
      });
      setTimeout(() => {
        if (this.isCapturing) {
          console.log("[VTF Extension] Re-scanning after reconnect");
          this.scanExistingElements();
        }
      }, 1e3);
    }
    /**
     * Handle session closed
     */
    handleSessionClosed() {
      console.log("[VTF Extension] Session closed - stopping capture");
      this.stopCapture();
    }
    /**
     * Handle session opened
     */
    handleSessionOpened() {
      console.log("[VTF Extension] Session opened");
      if (this.config.autoStart && !this.isCapturing) {
        console.log("[VTF Extension] Auto-restarting capture");
        this.startCapture();
      }
    }
    /**
     * Handle capture error
     */
    handleCaptureError(userId, error) {
      this.metrics.errors++;
      this.activeCaptures.delete(userId);
      this.sendMessage({
        type: "error",
        context: "audioCapture",
        userId,
        error: error.message,
        timestamp: Date.now()
      });
      if (error.message.includes("suspended") && this.audioElements.has(userId)) {
        console.log(`[VTF Extension] Retrying capture for ${userId} in 2s`);
        setTimeout(() => {
          const element = this.audioElements.get(userId);
          if (element) {
            this.handleNewAudioElement(element);
          }
        }, 2e3);
      }
    }
    /**
     * Scan for existing audio elements
     */
    scanExistingElements() {
      const elements = document.querySelectorAll('audio[id^="msRemAudio-"]');
      console.log(`[VTF Extension] Found ${elements.length} existing audio elements`);
      elements.forEach((element) => {
        this.handleNewAudioElement(element);
      });
    }
    /**
     * Set up Chrome extension message handlers
     */
    setupMessageHandlers() {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        const messageType = this.legacyMessageMap[request.type] || request.type;
        console.log(`[VTF Extension] Received message: ${messageType}`);
        switch (messageType) {
          case "startCapture":
            this.startCapture().then(() => sendResponse({ status: "started" })).catch((error) => sendResponse({ status: "error", error: error.message }));
            return true;
          case "stopCapture":
            this.stopCapture().then(() => sendResponse({ status: "stopped" })).catch((error) => sendResponse({ status: "error", error: error.message }));
            return true;
          case "getStatus":
            sendResponse(this.getStatus());
            return false;
          case "transcription":
            this.displayTranscription(request.data);
            sendResponse({ received: true });
            return false;
          case "reload":
            this.handleExtensionReload();
            sendResponse({ status: "reloading" });
            return false;
          default:
            console.warn(`[VTF Extension] Unknown message type: ${request.type}`);
            sendResponse({ error: "Unknown command" });
            return false;
        }
      });
    }
    /**
     * Start audio capture
     */
    async startCapture() {
      if (!this.isInitialized) {
        throw new Error("Extension not initialized");
      }
      if (this.isCapturing) {
        console.log("[VTF Extension] Already capturing");
        return;
      }
      console.log("[VTF Extension] Starting capture");
      this.isCapturing = true;
      this.scanExistingElements();
      this.sendMessage({
        type: "captureStarted",
        timestamp: Date.now()
      });
      this.notifyUser("VTF Audio Transcription Started", "success");
    }
    /**
     * Stop audio capture
     */
    async stopCapture() {
      if (!this.isCapturing) {
        console.log("[VTF Extension] Not capturing");
        return;
      }
      console.log("[VTF Extension] Stopping capture");
      this.isCapturing = false;
      this.streamMonitor.stopAll();
      this.pendingStreams.clear();
      this.audioCapture.stopAll();
      this.activeCaptures.clear();
      this.sendMessage({
        type: "captureStopped",
        timestamp: Date.now()
      });
      this.notifyUser("VTF Audio Transcription Stopped", "info");
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
      this.ensureTranscriptionDisplay();
      const display = document.getElementById("vtf-transcription-display");
      if (!display) return;
      const entry = document.createElement("div");
      entry.className = "vtf-transcript-entry";
      entry.innerHTML = `
      <div class="vtf-transcript-header">
        <span class="vtf-transcript-time">${new Date(transcription.timestamp).toLocaleTimeString()}</span>
        <span class="vtf-transcript-speaker">${transcription.speaker}</span>
      </div>
      <div class="vtf-transcript-text">${transcription.text}</div>
    `;
      const content = display.querySelector(".vtf-transcript-content");
      content.insertBefore(entry, content.firstChild);
      while (content.children.length > 50) {
        content.removeChild(content.lastChild);
      }
    }
    /**
     * Ensure transcription display exists
     */
    ensureTranscriptionDisplay() {
      if (document.getElementById("vtf-transcription-display")) return;
      const display = document.createElement("div");
      display.id = "vtf-transcription-display";
      display.innerHTML = `
      <div class="vtf-transcript-header">
        <h3>VTF Transcriptions</h3>
        <button class="vtf-transcript-close">\xD7</button>
      </div>
      <div class="vtf-transcript-content"></div>
    `;
      document.body.appendChild(display);
      display.querySelector(".vtf-transcript-close").addEventListener("click", () => {
        display.remove();
      });
    }
    /**
     * Show user notification
     */
    notifyUser(message, type = "info") {
      const notification = document.createElement("div");
      notification.className = `vtf-extension-notification ${type}`;
      notification.textContent = message;
      document.body.appendChild(notification);
      setTimeout(() => {
        notification.classList.add("fade-out");
        setTimeout(() => notification.remove(), 300);
      }, this.config.notificationDuration);
    }
    /**
     * Get speaker name for userId
     */
    getSpeakerName(userId) {
      const talkingUsers = this.stateMonitor.getState().talkingUsers;
      if (talkingUsers && talkingUsers.has) {
        const userData = talkingUsers.get(userId);
        if (userData?.name) return userData.name;
      }
      return `User-${userId.substring(0, 6).toUpperCase()}`;
    }
    /**
     * Send message to service worker
     */
    sendMessage(message) {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            console.error("[VTF Extension] Message send error:", chrome.runtime.lastError);
            this.handleExtensionError(chrome.runtime.lastError);
          }
        });
      } catch (error) {
        console.error("[VTF Extension] Failed to send message:", error);
        this.handleExtensionError(error);
      }
    }
    /**
     * Handle extension errors
     */
    handleExtensionError(error) {
      if (error.message?.includes("Extension context invalidated")) {
        this.handleExtensionReload();
      }
    }
    /**
     * Handle extension reload
     */
    handleExtensionReload() {
      console.log("[VTF Extension] Extension reloaded, showing notification");
      this.stopCapture();
      const notification = document.createElement("div");
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
        const result = await chrome.storage.local.get(["settings"]);
        return result.settings || {};
      } catch (error) {
        console.error("[VTF Extension] Failed to load settings:", error);
        return {};
      }
    }
    /**
     * Clean up partial initialization
     */
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
    /**
     * Destroy the extension
     */
    destroy() {
      console.log("[VTF Extension] Destroying extension instance");
      this.cleanup();
      this.audioCapture.destroy();
      this.streamMonitor.destroy();
      this.stateMonitor.destroy();
      this.globalsFinder.destroy();
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
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeExtension);
  } else {
    initializeExtension();
  }
  async function initializeExtension() {
    console.log("[VTF Extension] DOM ready, starting initialization");
    window.vtfExtension = new VTFAudioExtension();
    try {
      await window.vtfExtension.init();
    } catch (error) {
      console.error("[VTF Extension] Failed to initialize:", error);
    }
  }
  window.addEventListener("beforeunload", () => {
    if (window.vtfExtension) {
      window.vtfExtension.destroy();
    }
  });
})();
