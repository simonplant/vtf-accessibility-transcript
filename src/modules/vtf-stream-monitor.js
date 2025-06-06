/**
 * VTFStreamMonitor - Detects stream assignment without monkey-patching
 * 
 * This module monitors VTF audio elements for stream assignment using polling
 * instead of property overrides. It provides callbacks when streams are detected
 * and validates stream readiness before capture.
 * 
 * @module vtf-stream-monitor
 */

export class VTFStreamMonitor {
    constructor(options = {}) {
      // Configuration with defaults
      this.config = {
        pollInterval: 50,        // ms between srcObject checks
        maxPollTime: 5000,       // ms before timeout
        streamReadyTimeout: 5000, // ms to wait for stream ready
        enableDebugLogs: false,   // verbose logging
        ...options
      };
      
      // Calculate max polls from time
      this.config.maxPolls = Math.ceil(this.config.maxPollTime / this.config.pollInterval);
      
      // Active monitors tracked by userId
      this.monitors = new Map();
      
      // Statistics for debugging
      this.stats = {
        monitorsStarted: 0,
        monitorsSucceeded: 0,
        monitorsFailed: 0,
        streamsValidated: 0,
        totalDetectionTime: 0
      };
      
      // For cleanup tracking
      this.activeAnimationFrames = new Set();
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
      // Validate inputs
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
      
      // Check if already monitoring this user
      if (this.monitors.has(userId)) {
        console.warn(`[Stream Monitor] Already monitoring stream for ${userId}`);
        return false;
      }
      
      // Check if element already has stream
      if (element.srcObject && element.srcObject instanceof MediaStream) {
        if (this.config.enableDebugLogs) {
          console.log(`[Stream Monitor] Element ${userId} already has stream, calling callback immediately`);
        }
        
        try {
          callback(element.srcObject);
          this.stats.monitorsSucceeded++;
        } catch (error) {
          console.error('[Stream Monitor] Error in callback:', error);
        }
        return true;
      }
      
      // Create monitor configuration
      const monitor = {
        element,
        userId,
        callback,
        pollInterval: null,
        pollCount: 0,
        startTime: Date.now(),
        maxPolls: this.config.maxPolls
      };
      
      // Start polling for srcObject
      monitor.pollInterval = setInterval(() => {
        this.checkForStream(monitor);
      }, this.config.pollInterval);
      
      // Store monitor
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
      
      // Check if element still exists in DOM
      if (!monitor.element.isConnected) {
        console.warn(`[Stream Monitor] Element ${monitor.userId} removed from DOM, stopping monitor`);
        this.stopMonitoring(monitor.userId);
        this.stats.monitorsFailed++;
        return;
      }
      
      // Check for stream
      if (monitor.element.srcObject && monitor.element.srcObject instanceof MediaStream) {
        const detectionTime = Date.now() - monitor.startTime;
        console.log(`[Stream Monitor] Stream detected for ${monitor.userId} after ${detectionTime}ms (${monitor.pollCount} polls)`);
        
        // Clear interval immediately
        clearInterval(monitor.pollInterval);
        
        // Update stats
        this.stats.monitorsSucceeded++;
        this.stats.totalDetectionTime += detectionTime;
        
        // Remove from active monitors before callback (in case callback throws)
        this.monitors.delete(monitor.userId);
        
        // Call callback with stream
        try {
          monitor.callback(monitor.element.srcObject);
        } catch (error) {
          console.error('[Stream Monitor] Error in callback:', error);
        }
        
        return;
      }
      
      // Check for timeout
      if (monitor.pollCount >= monitor.maxPolls) {
        console.warn(`[Stream Monitor] Timeout waiting for stream ${monitor.userId} after ${this.config.maxPollTime}ms`);
        
        this.stopMonitoring(monitor.userId);
        this.stats.monitorsFailed++;
        
        // Call callback with null to indicate timeout
        try {
          monitor.callback(null);
        } catch (error) {
          console.error('[Stream Monitor] Error in timeout callback:', error);
        }
      }
      
      // Debug logging
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
        throw new Error('Invalid stream provided');
      }
      
      return new Promise((resolve, reject) => {
        const startTime = Date.now();
        let animationFrameId = null;
        let timeoutId = null;
        let checkCount = 0;
        
        // Set timeout
        timeoutId = setTimeout(() => {
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            this.activeAnimationFrames.delete(animationFrameId);
          }
          reject(new Error(`Stream ready timeout after ${this.config.streamReadyTimeout}ms`));
        }, this.config.streamReadyTimeout);
        
        const checkReady = () => {
          checkCount++;
          
          // Check if monitor was destroyed
          if (this.destroyed) {
            clearTimeout(timeoutId);
            reject(new Error('Monitor destroyed'));
            return;
          }
          
          // Check stream active state
          if (!stream.active) {
            clearTimeout(timeoutId);
            reject(new Error('Stream inactive'));
            return;
          }
          
          // Get audio tracks
          const audioTracks = stream.getAudioTracks();
          
          if (audioTracks.length === 0) {
            clearTimeout(timeoutId);
            reject(new Error('No audio tracks in stream'));
            return;
          }
          
          // Check first audio track
          const track = audioTracks[0];
          
          if (this.config.enableDebugLogs && checkCount % 60 === 0) {
            console.log(`[Stream Monitor] Checking stream ready: state=${track.readyState}, muted=${track.muted}`);
          }
          
          // Check if track is ready
          if (track.readyState === 'live' && !track.muted) {
            clearTimeout(timeoutId);
            this.activeAnimationFrames.delete(animationFrameId);
            
            const readyTime = Date.now() - startTime;
            console.log(`[Stream Monitor] Stream ready after ${readyTime}ms`);
            
            this.stats.streamsValidated++;
            resolve(stream);
          } else {
            // Continue checking
            animationFrameId = requestAnimationFrame(checkReady);
            this.activeAnimationFrames.add(animationFrameId);
          }
        };
        
        // Start checking
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
      
      // Clear interval
      if (monitor.pollInterval) {
        clearInterval(monitor.pollInterval);
      }
      
      // Remove from map
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
      
      // Stop each monitor
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
        averageDetectionTime: this.stats.monitorsSucceeded > 0 
          ? Math.round(this.stats.totalDetectionTime / this.stats.monitorsSucceeded) 
          : 0,
        activeAnimationFrames: this.activeAnimationFrames.size,
        destroyed: this.destroyed
      };
    }
    
    /**
     * Clean up all resources
     */
    destroy() {
      console.log('[Stream Monitor] Destroying monitor instance');
      
      this.destroyed = true;
      
      // Stop all monitors
      this.stopAll();
      
      // Cancel any pending animation frames
      for (const frameId of this.activeAnimationFrames) {
        cancelAnimationFrame(frameId);
      }
      this.activeAnimationFrames.clear();
      
      // Clear references
      this.monitors.clear();
    }
  }
  
  // Export as default as well
  export default VTFStreamMonitor;