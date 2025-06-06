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
    // Strategy 1: Check window.E_ (from console log)
    if (window.E_ && typeof window.E_ === 'object' && window.E_.audioVolume !== undefined) {
      this.globals = window.E_;
      console.log('[VTF Globals] Found at window.E_');
      return true;
    }
    
    // Strategy 2: Search all single/double letter window properties
    const windowKeys = Object.keys(window);
    for (const key of windowKeys) {
      if (key.length <= 2 && window[key] && typeof window[key] === 'object') {
        if (window[key].audioVolume !== undefined || 
            window[key].sessData !== undefined ||
            window[key].preferences !== undefined) {
          this.globals = window[key];
          console.log(`[VTF Globals] Found at window.${key}`);
          return true;
        }
      }
    }
    
    // Strategy 3: Check Angular contexts (previous approach)
    const topRoom = document.getElementById('topRoomDiv');
    if (topRoom && topRoom.__ngContext__) {
      for (let i = 0; i < topRoom.__ngContext__.length; i++) {
        const ctx = topRoom.__ngContext__[i];
        if (ctx && typeof ctx === 'object') {
          // Check for globals directly
          if (ctx.globals && ctx.globals.audioVolume !== undefined) {
            this.globals = ctx.globals;
            console.log(`[VTF Globals] Found at topRoomDiv.__ngContext__[${i}].globals`);
            return true;
          }
          // Check for appService.globals
          if (ctx.appService?.globals?.audioVolume !== undefined) {
            this.globals = ctx.appService.globals;
            this.appService = ctx.appService;
            console.log(`[VTF Globals] Found at topRoomDiv.__ngContext__[${i}].appService.globals`);
            return true;
          }
        }
      }
    }
    
    // Strategy 4: Search for MediaSoupService
    for (const key of windowKeys) {
      if (window[key] && typeof window[key] === 'object') {
        if (window[key].startListeningToPresenter && 
            typeof window[key].startListeningToPresenter === 'function') {
          this.mediaSoupService = window[key];
          console.log(`[VTF Globals] Found MediaSoupService at window.${key}`);
          // Try to find globals through service
          if (window[key].globals) {
            this.globals = window[key].globals;
            return true;
          }
        }
      }
    }
    
    return false;
  }
  
  debug() {
    const topRoom = document.getElementById('topRoomDiv');
    
    return {
      found: !!this.globals,
      attempts: this.attempts,
      windowE_: !!window.E_,
      windowE_hasVolume: window.E_?.audioVolume !== undefined,
      elements: {
        topRoomDiv: !!topRoom,
        topRoomContext: topRoom ? !!topRoom.__ngContext__ : false
      },
      globals: this.globals ? {
        hasAudioVolume: this.globals.audioVolume !== undefined,
        audioVolume: this.globals.audioVolume,
        properties: Object.keys(this.globals).slice(0, 10) // First 10 properties
      } : null
    };
  }
  
  destroy() {
    this.globals = null;
    this.appService = null;
    this.mediaSoupService = null;
  }
}