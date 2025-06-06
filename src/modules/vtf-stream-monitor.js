

export class VTFStreamMonitor {
    constructor(options = {}) {
      
      this.config = {
        pollInterval: 50,        
        maxPollTime: 5000,       
        streamReadyTimeout: 5000, 
        enableDebugLogs: false,   
        ...options
      };
      
      
      this.config.maxPolls = Math.ceil(this.config.maxPollTime / this.config.pollInterval);
      
      
      this.monitors = new Map();
      
      
      this.stats = {
        monitorsStarted: 0,
        monitorsSucceeded: 0,
        monitorsFailed: 0,
        streamsValidated: 0,
        totalDetectionTime: 0
      };
      
      
      this.activeAnimationFrames = new Set();
      this.destroyed = false;
    }
    
    
    startMonitoring(element, userId, callback) {
      
      if (!element || !(element instanceof HTMLAudioElement)) {
        console.error('[Stream Monitor] Invalid element provided for monitoring');
        return false;
      }
      
      if (!userId || typeof userId !== 'string') {
        console.error('[Stream Monitor] Invalid userId provided');
        return false;
      }
      
      if (typeof callback !== 'function') {
        console.error('[Stream Monitor] Callback must be a function');
        return false;
      }
      
      
      if (this.monitors.has(userId)) {
        
        return false;
      }
      
      
      if (element.srcObject && element.srcObject instanceof MediaStream) {
        if (this.config.enableDebugLogs) {
          
        }
        
        try {
          callback(element.srcObject);
          this.stats.monitorsSucceeded++;
        } catch (error) {
          console.error('[Stream Monitor] Error in callback:', error);
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
      
      
      return true;
    }
    
    
    checkForStream(monitor) {
      monitor.pollCount++;
      
      
      if (!monitor.element.isConnected) {
        
        this.stopMonitoring(monitor.userId);
        this.stats.monitorsFailed++;
        return;
      }
      
      
      if (monitor.element.srcObject && monitor.element.srcObject instanceof MediaStream) {
        const detectionTime = Date.now() - monitor.startTime;
        
        
        clearInterval(monitor.pollInterval);
        
        
        this.stats.monitorsSucceeded++;
        this.stats.totalDetectionTime += detectionTime;
        
        
        this.monitors.delete(monitor.userId);
        
        
        try {
          monitor.callback(monitor.element.srcObject);
        } catch (error) {
          console.error('[Stream Monitor] Error in callback:', error);
        }
        
        return;
      }
      
      
      if (monitor.pollCount >= monitor.maxPolls) {
        
        this.stopMonitoring(monitor.userId);
        this.stats.monitorsFailed++;
        
        
        try {
          monitor.callback(null);
        } catch (error) {
          console.error('[Stream Monitor] Error in timeout callback:', error);
        }
      }
      
      
      if (this.config.enableDebugLogs && monitor.pollCount % 20 === 0) {
        
      }
    }
    
    
    async waitForStreamReady(stream) {
      if (!stream || !(stream instanceof MediaStream)) {
        throw new Error('Invalid stream provided');
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
            reject(new Error('Monitor destroyed'));
            return;
          }
          
          
          if (!stream.active) {
            clearTimeout(timeoutId);
            reject(new Error('Stream inactive'));
            return;
          }
          
          
          const audioTracks = stream.getAudioTracks();
          
          if (audioTracks.length === 0) {
            clearTimeout(timeoutId);
            reject(new Error('No audio tracks in stream'));
            return;
          }
          
          
          const track = audioTracks[0];
          
          if (this.config.enableDebugLogs && checkCount % 60 === 0) {
            
          }
          
          
          if (track.readyState === 'live' && !track.muted) {
            clearTimeout(timeoutId);
            this.activeAnimationFrames.delete(animationFrameId);
            
            const readyTime = Date.now() - startTime;
            
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
    
    
    stopMonitoring(userId) {
      const monitor = this.monitors.get(userId);
      
      if (!monitor) {
        return false;
      }
      
      
      if (monitor.pollInterval) {
        clearInterval(monitor.pollInterval);
      }
      
      
      this.monitors.delete(userId);
      
      
      return true;
    }
    
    
    stopAll() {
      const count = this.monitors.size;
      
      
      for (const [userId] of this.monitors) {
        this.stopMonitoring(userId);
      }
      
      
      return count;
    }
    
    
    isMonitoring(userId) {
      return this.monitors.has(userId);
    }
    
    
    getMonitorCount() {
      return this.monitors.size;
    }
    
    
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
        averageDetectionTime: this.stats.monitorsSucceeded > 0 
          ? Math.round(this.stats.totalDetectionTime / this.stats.monitorsSucceeded) 
          : 0,
        activeAnimationFrames: this.activeAnimationFrames.size,
        destroyed: this.destroyed
      };
    }
    
    
    destroy() {
      
      this.destroyed = true;
      
      
      this.stopAll();
      
      
      for (const frameId of this.activeAnimationFrames) {
        cancelAnimationFrame(frameId);
      }
      this.activeAnimationFrames.clear();
      
      
      this.monitors.clear();
    }
  }
  
  
  export default VTFStreamMonitor;