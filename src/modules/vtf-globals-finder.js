

export class VTFGlobalsFinder {
  constructor(options = {}) {
    this.config = {
      pollInterval: 500,
      maxAttempts: 60,
      ...options
    };
    
    
    this.componentLocations = {
      app: { elementId: 'webcam', contextIndex: 8 },
      room: { elementId: 'topRoomDiv', contextIndex: 31 }
    };
    
    
    this.globals = null;
    this.appService = null;
    this.mediaSoupService = null;
    this.roomComponent = null;
    
    
    this.attempts = 0;
  }
  
  
  async waitForGlobals() {
    
    this.attempts = 0;
    
    while (this.attempts < this.config.maxAttempts) {
      if (this.findGlobals()) {
        
        return true;
      }
      
      this.attempts++;
      
      
      if (this.attempts % 10 === 0) {
        
      }
      
      await new Promise(resolve => setTimeout(resolve, this.config.pollInterval));
    }
    
    console.error('[VTF Globals] Timeout - Angular context not found');
    return false;
  }
  
  
  findGlobals() {
    
    if (this.globals && this.isValidGlobals(this.globals)) {
      return true;
    }
    
    
    const appElement = document.getElementById(this.componentLocations.app.elementId);
    if (appElement?.__ngContext__) {
      const appComponent = appElement.__ngContext__[this.componentLocations.app.contextIndex];
      
      if (appComponent?.appService?.globals) {
        if (this.isValidGlobals(appComponent.appService.globals)) {
          
          this.globals = appComponent.appService.globals;
          this.appService = appComponent.appService;
          
          
          this.findRoomComponent();
          
          return true;
        }
      }
    }
    
    
    const roomElement = document.getElementById(this.componentLocations.room.elementId);
    if (roomElement?.__ngContext__) {
      const roomComponent = roomElement.__ngContext__[this.componentLocations.room.contextIndex];
      
      if (roomComponent?.appService?.globals) {
        if (this.isValidGlobals(roomComponent.appService.globals)) {
          
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
  
  
  findRoomComponent() {
    if (this.roomComponent && this.mediaSoupService) return;
    
    const roomElement = document.getElementById(this.componentLocations.room.elementId);
    if (roomElement?.__ngContext__) {
      const roomComponent = roomElement.__ngContext__[this.componentLocations.room.contextIndex];
      
      if (roomComponent) {
        this.roomComponent = roomComponent;
        this.mediaSoupService = roomComponent.mediaSoupService;
        
      }
    }
  }
  
  
  isValidGlobals(obj) {
    if (!obj || typeof obj !== 'object') return false;
    
    
    const required = ['audioVolume', 'sessData', 'preferences', 'videoDeviceID'];
    const hasRequired = required.every(prop => obj.hasOwnProperty(prop));
    
    if (!hasRequired) return false;
    
    
    if (typeof obj.audioVolume !== 'number' || obj.audioVolume < 0 || obj.audioVolume > 1) {
      return false;
    }
    
    return true;
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
      componentLocations: this.componentLocations
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