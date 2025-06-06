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
    // Strategy 1: Check DOM elements for Angular context
    const topRoom = document.getElementById('topRoomDiv');
    const webcam = document.getElementById('webcam');
    
    // Try topRoomDiv first - it usually has the full context
    if (topRoom && topRoom.__ngContext__) {
      // Just scan through all indices - don't assume a specific one
      for (let i = 0; i < topRoom.__ngContext__.length; i++) {
        const ctx = topRoom.__ngContext__[i];
        if (ctx && typeof ctx === 'object' && ctx.appService?.globals) {
          this.globals = ctx.appService.globals;
          this.appService = ctx.appService;
          this.mediaSoupService = ctx.mediaSoupService;
          console.log(`[VTF Globals] Found at topRoomDiv.__ngContext__[${i}]`);
          return true;
        }
      }
    }
    
    // Try webcam element as fallback
    if (webcam && webcam.__ngContext__) {
      for (let i = 0; i < webcam.__ngContext__.length; i++) {
        const ctx = webcam.__ngContext__[i];
        if (ctx && typeof ctx === 'object' && ctx.appService?.globals) {
          this.globals = ctx.appService.globals;
          this.appService = ctx.appService;
          console.log(`[VTF Globals] Found at webcam.__ngContext__[${i}]`);
          return true;
        }
      }
    }
    
    // Strategy 2: Look for VTF functions that might expose globals
    if (typeof window.adjustVol === 'function') {
      // VTF's adjustVol function often references this.appService.globals
      try {
        // Create a test element to see if we can find the context
        const testAudio = document.querySelector('audio[id^="msRemAudio-"]');
        if (testAudio) {
          const parent = testAudio.parentElement;
          if (parent && parent.__ngContext__) {
            console.log('[VTF Globals] Found context via audio element parent');
            // Similar search through context
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    return false;
  }
  
  debug() {
    const topRoom = document.getElementById('topRoomDiv');
    const webcam = document.getElementById('webcam');
    
    return {
      found: !!this.globals,
      attempts: this.attempts,
      elements: {
        topRoomDiv: !!topRoom,
        topRoomContext: topRoom ? !!topRoom.__ngContext__ : false,
        topRoomContextLength: topRoom?.__ngContext__?.length || 0,
        webcam: !!webcam,
        webcamContext: webcam ? !!webcam.__ngContext__ : false,
        webcamContextLength: webcam?.__ngContext__?.length || 0
      },
      globals: this.globals ? {
        hasAudioVolume: !!this.globals.audioVolume,
        audioVolume: this.globals.audioVolume,
        properties: Object.keys(this.globals).length
      } : null
    };
  }
  
  destroy() {
    this.globals = null;
    this.appService = null;
    this.mediaSoupService = null;
  }
}

export default VTFGlobalsFinder;