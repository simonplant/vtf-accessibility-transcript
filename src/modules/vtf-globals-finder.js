// Replace your src/modules/vtf-globals-finder.js with this:

export class VTFGlobalsFinder {
  constructor() {
    this.globals = null;
    this.appService = null;
    this.mediaSoupService = null;
    this.roomComponent = null;
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
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    console.error('[VTF Globals] Timeout - Angular context not found');
    return false;
  }
  
  findGlobals() {
    // This is the fix - directly access the Angular context
    const room = document.getElementById('topRoomDiv');
    if (room?.__ngContext__?.[31]?.appService?.globals) {
      this.globals = room.__ngContext__[31].appService.globals;
      this.appService = room.__ngContext__[31].appService;
      this.mediaSoupService = room.__ngContext__[31].mediaSoupService;
      this.roomComponent = room.__ngContext__[31];
      return true;
    }
    
    // Fallback to webcam element
    const webcam = document.getElementById('webcam');
    if (webcam?.__ngContext__?.[8]?.appService?.globals) {
      this.globals = webcam.__ngContext__[8].appService.globals;
      this.appService = webcam.__ngContext__[8].appService;
      // Try to get MediaSoup from room element
      if (room?.__ngContext__?.[31]?.mediaSoupService) {
        this.mediaSoupService = room.__ngContext__[31].mediaSoupService;
        this.roomComponent = room.__ngContext__[31];
      }
      return true;
    }
    
    return false;
  }
  
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
      }
    };
  }
  
  destroy() {
    this.globals = null;
    this.appService = null;
    this.mediaSoupService = null;
    this.roomComponent = null;
  }
}

export default VTFGlobalsFinder;