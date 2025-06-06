export class VTFGlobalsFinder {
  constructor() {
    this.globals = null;
    this.appService = null;
    this.mediaSoupService = null;
    this.attempts = 0;
  }
  
  async waitForGlobals(maxRetries = 60, interval = 500) {
    console.log('[VTF Globals] Starting search...');
    this.attempts = 0;
    
    for (let i = 0; i < maxRetries; i++) {
      if (this.findGlobals()) {
        console.log(`[VTF Globals] Found after ${i * interval}ms`);
        return true;
      }
      
      this.attempts++;
      
      if (i % 10 === 0 && i > 0) {
        console.log(`[VTF Globals] Still searching... attempt ${i}/${maxRetries}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    console.error('[VTF Globals] Timeout after', maxRetries * interval / 1000, 'seconds');
    return false;
  }
  
  findGlobals() {
    // Direct check for window.E_ (from console logs)
    if (window.E_) {
      console.log('Globals: E_');  // Match the prototype's logging
      this.globals = window.E_;
      
      // Look for MediaSoupService and appService if available
      this.findServices();
      return true;
    }
    
    // Fallback: scan for objects with expected VTF properties
    const expectedProps = ['audioVolume', 'sessData', 'preferences'];
    for (const key in window) {
      if (key.length <= 3 && window[key] && typeof window[key] === 'object') {
        try {
          // Check if this object has VTF-like properties
          let matchCount = 0;
          for (const prop of expectedProps) {
            if (window[key].hasOwnProperty(prop)) {
              matchCount++;
            }
          }
          
          if (matchCount >= 2) {  // At least 2 of the expected properties
            console.log(`[VTF Globals] Found at window.${key} via property scan`);
            this.globals = window[key];
            this.findServices();
            return true;
          }
        } catch (e) {
          // Ignore errors from accessing protected properties
        }
      }
    }
    
    return false;
  }
  
  findServices() {
    // Look for MediaSoupService (might be at various locations)
    const servicePaths = [
      'mediaSoupService',
      'appService.mediaSoupService',
      'appService.mediaHandlerService.mediaSoupService'
    ];
    
    for (const path of servicePaths) {
      const service = this.getNestedProperty(this.globals, path);
      if (service && typeof service.startListeningToPresenter === 'function') {
        this.mediaSoupService = service;
        console.log(`[VTF Globals] Found MediaSoupService at globals.${path}`);
        break;
      }
    }
    
    // Look for appService
    if (this.globals.appService) {
      this.appService = this.globals.appService;
      console.log('[VTF Globals] Found appService');
    }
  }
  
  getNestedProperty(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  debug() {
    return {
      found: !!this.globals,
      attempts: this.attempts,
      globalsLocation: this.globals === window.E_ ? 'window.E_' : 'other',
      globals: this.globals ? {
        hasAudioVolume: this.globals.audioVolume !== undefined,
        audioVolume: this.globals.audioVolume,
        hasSessData: !!this.globals.sessData,
        hasPreferences: !!this.globals.preferences,
        properties: Object.keys(this.globals).slice(0, 10)
      } : null,
      services: {
        hasMediaSoup: !!this.mediaSoupService,
        hasAppService: !!this.appService
      }
    };
  }
  
  destroy() {
    this.globals = null;
    this.appService = null;
    this.mediaSoupService = null;
  }
}

export default VTFGlobalsFinder;