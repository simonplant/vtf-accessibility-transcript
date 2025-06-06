// Replace your vtf-globals-finder.js with this version that handles timing better:

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
    
    // First, wait for the elements to exist
    await this.waitForElements();
    
    // Then wait for Angular context
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
    
    console.error('[VTF Globals] Timeout - Angular context not found');
    return false;
  }
  
  async waitForElements() {
    console.log('[VTF Globals] Waiting for DOM elements...');
    
    for (let i = 0; i < 20; i++) {
      const room = document.getElementById('topRoomDiv');
      const webcam = document.getElementById('webcam');
      
      if (room || webcam) {
        console.log('[VTF Globals] Elements found');
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.warn('[VTF Globals] Elements not found after 10 seconds');
  }
  
  findGlobals() {
    // Check topRoomDiv first (has full services)
    const room = document.getElementById('topRoomDiv');
    if (room?.__ngContext__) {
      // Log what we see
      if (this.attempts === 0 || this.attempts % 10 === 0) {
        console.log(`[VTF Globals] topRoomDiv context length: ${room.__ngContext__.length}`);
      }
      
      // Check index 31
      if (room.__ngContext__[31]?.appService?.globals) {
        this.globals = room.__ngContext__[31].appService.globals;
        this.appService = room.__ngContext__[31].appService;
        this.mediaSoupService = room.__ngContext__[31].mediaSoupService;
        this.roomComponent = room.__ngContext__[31];
        console.log('[VTF Globals] Found via topRoomDiv[31]');
        return true;
      }
    }
    
    // Fallback to webcam element
    const webcam = document.getElementById('webcam');
    if (webcam?.__ngContext__) {
      // Check index 8
      if (webcam.__ngContext__[8]?.appService?.globals) {
        this.globals = webcam.__ngContext__[8].appService.globals;
        this.appService = webcam.__ngContext__[8].appService;
        
        // Try to get MediaSoup from room element
        if (room?.__ngContext__?.[31]?.mediaSoupService) {
          this.mediaSoupService = room.__ngContext__[31].mediaSoupService;
          this.roomComponent = room.__ngContext__[31];
        }
        
        console.log('[VTF Globals] Found via webcam[8]');
        return true;
      }
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
      },
      elements: {
        topRoomDiv: !!document.getElementById('topRoomDiv'),
        webcam: !!document.getElementById('webcam')
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