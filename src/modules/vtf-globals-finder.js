/**
 * VTFGlobalsFinder - Locates VTF global objects in Angular 11 context
 * 
 * VTF is an Angular 11 application that stores its state in component contexts
 * accessible via the __ngContext__ property on DOM elements.
 * 
 * @module vtf-globals-finder
 */

export class VTFGlobalsFinder {
  constructor(options = {}) {
    this.config = {
      pollInterval: 500,
      maxAttempts: 60,
      ...options
    };
    
    // VTF Angular component locations
    this.componentLocations = {
      app: { elementId: 'webcam', contextIndex: 8 },
      room: { elementId: 'topRoomDiv', contextIndex: 31 }
    };
    
    // Found references
    this.globals = null;
    this.appService = null;
    this.mediaSoupService = null;
    this.roomComponent = null;
    
    // State
    this.attempts = 0;
  }
  
  /**
   * Wait for VTF globals to be available
   * @returns {Promise<boolean>} - True if found, false if timeout
   */
  async waitForGlobals() {
    console.log('[VTF Globals] Starting Angular context search...');
    
    this.attempts = 0;
    
    while (this.attempts < this.config.maxAttempts) {
      if (this.findGlobals()) {
        console.log(`[VTF Globals] Found after ${this.attempts * this.config.pollInterval}ms`);
        return true;
      }
      
      this.attempts++;
      
      // Progress update every 5 seconds
      if (this.attempts % 10 === 0) {
        console.log(`[VTF Globals] Still searching... (${this.attempts} attempts)`);
      }
      
      await new Promise(resolve => setTimeout(resolve, this.config.pollInterval));
    }
    
    console.error('[VTF Globals] Timeout - Angular context not found');
    return false;
  }
  
  /**
   * Search for globals in Angular components
   * @returns {boolean} - True if found
   */
  findGlobals() {
    // Already found
    if (this.globals && this.isValidGlobals(this.globals)) {
      return true;
    }
    
    // Try app component first (webcam element)
    const appElement = document.getElementById(this.componentLocations.app.elementId);
    if (appElement?.__ngContext__) {
      const appComponent = appElement.__ngContext__[this.componentLocations.app.contextIndex];
      
      if (appComponent?.appService?.globals) {
        if (this.isValidGlobals(appComponent.appService.globals)) {
          console.log('[VTF Globals] Found in app component (webcam)');
          
          this.globals = appComponent.appService.globals;
          this.appService = appComponent.appService;
          
          // Now get room component for mediaSoupService
          this.findRoomComponent();
          
          return true;
        }
      }
    }
    
    // Fallback: try room component directly
    const roomElement = document.getElementById(this.componentLocations.room.elementId);
    if (roomElement?.__ngContext__) {
      const roomComponent = roomElement.__ngContext__[this.componentLocations.room.contextIndex];
      
      if (roomComponent?.appService?.globals) {
        if (this.isValidGlobals(roomComponent.appService.globals)) {
          console.log('[VTF Globals] Found in room component (topRoomDiv)');
          
          this.globals = roomComponent.appService.globals;
          this.appService = roomComponent.appService;
          this.roomComponent = roomComponent;
          this.mediaSoupService = roomComponent.mediaSoupService;
          
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Find room component for mediaSoupService access
   */
  findRoomComponent() {
    if (this.roomComponent && this.mediaSoupService) return;
    
    const roomElement = document.getElementById(this.componentLocations.room.elementId);
    if (roomElement?.__ngContext__) {
      const roomComponent = roomElement.__ngContext__[this.componentLocations.room.contextIndex];
      
      if (roomComponent) {
        this.roomComponent = roomComponent;
        this.mediaSoupService = roomComponent.mediaSoupService;
        console.log('[VTF Globals] Found room component and mediaSoupService');
      }
    }
  }
  
  /**
   * Validate globals object structure
   * @param {Object} obj - Object to validate
   * @returns {boolean} - True if valid VTF globals
   */
  isValidGlobals(obj) {
    if (!obj || typeof obj !== 'object') return false;
    
    // Required properties
    const required = ['audioVolume', 'sessData', 'preferences', 'videoDeviceID'];
    const hasRequired = required.every(prop => obj.hasOwnProperty(prop));
    
    if (!hasRequired) return false;
    
    // Validate audioVolume range (0-1, not 0-100)
    if (typeof obj.audioVolume !== 'number' || obj.audioVolume < 0 || obj.audioVolume > 1) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Get debug information
   * @returns {Object} - Current state
   */
  debug() {
    return {
      found: !!this.globals,
      attempts: this.attempts,
      globals: this.globals ? {
        audioVolume: this.globals.audioVolume,
        sessionState: this.globals.sessData?.currentState,
        propertyCount: Object.keys(this.globals).length
      } : null,
      services: {
        appService: !!this.appService,
        mediaSoupService: !!this.mediaSoupService,
        roomComponent: !!this.roomComponent
      },
      componentLocations: this.componentLocations
    };
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    console.log('[VTF Globals] Destroying finder');
    this.globals = null;
    this.appService = null;
    this.mediaSoupService = null;
    this.roomComponent = null;
  }
}

export default VTFGlobalsFinder;