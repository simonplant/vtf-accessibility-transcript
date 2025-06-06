/**
 * VTFGlobalsFinder - Robustly locates VTF global objects without timing assumptions
 * 
 * This module searches for VTF's global state objects using multiple strategies:
 * 1. Direct path resolution for known locations
 * 2. Function signature detection
 * 3. jQuery-based element detection
 * 
 * @module vtf-globals-finder
 */

export class VTFGlobalsFinder {
    constructor(options = {}) {
      // Configuration with defaults
      this.config = {
        defaultInterval: 500,
        defaultMaxRetries: 60,
        ...options
      };
  
      // Search paths for globals object
      this.searchPaths = [
        'window.globals',
        'window.appService.globals',
        'window.mediaSoupService',
        'window.app.globals',
        'window.vtf.globals',
        'window.t3.globals'
      ];
      
      // VTF function signatures to detect
      this.functionSignatures = [
        'startListeningToPresenter',
        'stopListeningToPresenter',
        'reconnectAudio',
        'adjustVol'
      ];
      
      // State
      this.globals = null;
      this.mediaSoupService = null;
      this.foundPath = null;
      this.foundMethod = null;
      
      // For cleanup
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
      console.log('[VTF Globals] Starting search...');
      
      // Clear any existing search
      this.cleanup();
      this.searchCount = 0;
      
      for (let i = 0; i < maxRetries; i++) {
        this.searchCount = i;
        
        if (this.findGlobals()) {
          console.log(`[VTF Globals] Found after ${i * interval}ms using ${this.foundMethod}`);
          return true;
        }
        
        // Progress logging every 5 seconds
        if (i % 10 === 0 && i > 0) {
          console.log(`[VTF Globals] Still searching... (${i * interval}ms elapsed)`);
        }
        
        // Wait with cancellable timeout
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
      // Skip if already found
      if (this.globals && this.isValidGlobals(this.globals)) {
        return true;
      }
      
      // Method 1: Search known paths
      for (const path of this.searchPaths) {
        try {
          const obj = this.resolvePath(path);
          if (this.isValidGlobals(obj)) {
            this.globals = obj;
            this.foundPath = path;
            this.foundMethod = 'path-resolution';
            console.log('[VTF Globals] Found at path:', path);
            this.findRelatedServices();
            return true;
          }
        } catch (e) {
          // Path doesn't exist, continue searching
        }
      }
      
      // Method 2: Search by function signatures
      if (this.findByFunctions()) {
        this.foundMethod = 'function-detection';
        return true;
      }
      
      // Method 3: Search by jQuery selectors (VTF uses jQuery)
      if (this.findByJQuery()) {
        this.foundMethod = 'jquery-detection';
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
        return path.split('.').reduce((obj, key) => obj?.[key], window);
      } catch (e) {
        return undefined;
      }
    }
    
    /**
     * Validate if an object looks like VTF globals
     * @param {*} obj - Object to validate
     * @returns {boolean} - True if object has expected VTF properties
     */
    isValidGlobals(obj) {
      if (!obj || typeof obj !== 'object') return false;
      
      // Check for expected VTF global properties
      const markers = ['audioVolume', 'sessData', 'preferences', 'videoDeviceID'];
      const hasMarkers = markers.some(marker => obj.hasOwnProperty(marker));
      
      // Additional validation: audioVolume should be a number between 0 and 1
      if (hasMarkers && typeof obj.audioVolume === 'number') {
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
          if (typeof window[funcName] === 'function') {
            console.log('[VTF Globals] Found VTF function:', funcName);
            
            // Try to extract globals from function context
            const funcStr = window[funcName].toString();
            
            // Look for globals references in function body
            if (funcStr.includes('this.globals') || funcStr.includes('globals.')) {
              console.log('[VTF Globals] Globals referenced in function');
              
              // Try to find globals through common patterns
              const patterns = [
                'window.appService?.globals',
                'this.appService?.globals',
                'this.globals'
              ];
              
              for (const pattern of patterns) {
                const obj = this.resolvePath(pattern.replace('this.', 'window.'));
                if (this.isValidGlobals(obj)) {
                  this.globals = obj;
                  this.foundPath = pattern;
                  console.log('[VTF Globals] Found via function pattern:', pattern);
                  this.findRelatedServices();
                  return true;
                }
              }
            }
          }
        } catch (e) {
          // Function doesn't exist or error accessing it
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
        // Check if jQuery is available
        const $ = window.$ || window.jQuery;
        if (typeof $ !== 'function') {
          return false;
        }
        
        // Check if VTF's audio elements exist
        const audioElements = $("[id^='msRemAudio-']");
        if (audioElements.length > 0) {
          console.log('[VTF Globals] Found VTF audio elements via jQuery');
          
          // VTF is active, but we still need to find globals
          // Try common jQuery data storage patterns
          const $body = $('body');
          const appData = $body.data('app') || $body.data('vtf');
          
          if (appData && this.isValidGlobals(appData.globals)) {
            this.globals = appData.globals;
            this.foundPath = 'jQuery-data';
            return true;
          }
          
          // Even if we can't find globals directly, VTF is present
          // This is useful information for the caller
          console.log('[VTF Globals] VTF detected but globals not yet accessible');
        }
      } catch (e) {
        // jQuery not available or error
      }
      return false;
    }
    
    /**
     * Find related VTF services once globals are located
     */
    findRelatedServices() {
      // Look for MediaSoup service
      const servicePaths = [
        'window.mediaSoupService',
        'window.appService.mediaSoupService',
        'window.services.mediaSoup',
        'window.app.mediaSoupService'
      ];
      
      for (const path of servicePaths) {
        try {
          const service = this.resolvePath(path);
          if (service && typeof service.startListeningToPresenter === 'function') {
            this.mediaSoupService = service;
            console.log('[VTF Globals] Found MediaSoup service at:', path);
            break;
          }
        } catch (e) {
          // Service path doesn't exist
        }
      }
      
      // Also look for other useful services
      this.findAppService();
      this.findAlertsService();
    }
    
    /**
     * Find the app service if available
     */
    findAppService() {
      const appPaths = ['window.appService', 'window.app'];
      for (const path of appPaths) {
        try {
          const service = this.resolvePath(path);
          if (service && typeof service === 'object') {
            this.appService = service;
            console.log('[VTF Globals] Found app service at:', path);
            break;
          }
        } catch (e) {
          // Continue searching
        }
      }
    }
    
    /**
     * Find the alerts service if available
     */
    findAlertsService() {
      const alertPaths = ['window.alertsService', 'window.appService.alertsService'];
      for (const path of alertPaths) {
        try {
          const service = this.resolvePath(path);
          if (service && typeof service.alert === 'function') {
            this.alertsService = service;
            console.log('[VTF Globals] Found alerts service at:', path);
            break;
          }
        } catch (e) {
          // Continue searching
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
      console.log('[VTF Globals] Destroying finder instance');
      this.cleanup();
      this.globals = null;
      this.mediaSoupService = null;
      this.appService = null;
      this.alertsService = null;
    }
  }
  
  // Also export as default for convenience
  export default VTFGlobalsFinder;