/**
 * Reconnection Handler for VTF Audio Extension
 * Handles reconnection scenarios and preserves transcription state
 */
export class ReconnectionHandler {
  constructor(options = {}) {
    this.config = {
      maxReconnectAttempts: 5,
      reconnectDelay: 1000,
      backoffMultiplier: 2,
      preserveHistory: true,
      autoResume: true,
      ...options
    };
    
    this.state = {
      isReconnecting: false,
      reconnectAttempts: 0,
      lastDisconnectTime: null,
      lastConnectTime: null,
      previousCaptures: new Map()
    };
    
    this.callbacks = {
      onReconnecting: null,
      onReconnected: null,
      onReconnectFailed: null,
      onStateRestored: null
    };
    
    this.reconnectTimer = null;
  }
  
  /**
   * Set callback functions
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (this.callbacks.hasOwnProperty(event)) {
      this.callbacks[event] = callback;
    }
  }
  
  /**
   * Handle disconnection event
   * @param {Object} captureState - Current capture state to preserve
   */
  handleDisconnect(captureState = {}) {
    console.log('[Reconnection Handler] Handling disconnect');
    
    this.state.lastDisconnectTime = Date.now();
    this.state.isReconnecting = true;
    
    // Preserve current capture state
    if (captureState.activeCaptures) {
      captureState.activeCaptures.forEach((userId) => {
        this.state.previousCaptures.set(userId, {
          userId,
          disconnectTime: Date.now(),
          wasCapturing: true
        });
      });
    }
    
    // Start reconnection process
    this.startReconnection();
  }
  
  /**
   * Start reconnection attempts
   */
  async startReconnection() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    const attempt = async () => {
      if (this.state.reconnectAttempts >= this.config.maxReconnectAttempts) {
        console.error('[Reconnection Handler] Max reconnect attempts reached');
        this.state.isReconnecting = false;
        
        if (this.callbacks.onReconnectFailed) {
          this.callbacks.onReconnectFailed({
            attempts: this.state.reconnectAttempts,
            duration: Date.now() - this.state.lastDisconnectTime
          });
        }
        return;
      }
      
      this.state.reconnectAttempts++;
      console.log(`[Reconnection Handler] Reconnect attempt ${this.state.reconnectAttempts}`);
      
      if (this.callbacks.onReconnecting) {
        this.callbacks.onReconnecting({
          attempt: this.state.reconnectAttempts,
          maxAttempts: this.config.maxReconnectAttempts
        });
      }
      
      try {
        // Check if VTF globals are available
        const isConnected = await this.checkConnection();
        
        if (isConnected) {
          await this.handleReconnectSuccess();
        } else {
          // Schedule next attempt with exponential backoff
          const delay = this.config.reconnectDelay * 
            Math.pow(this.config.backoffMultiplier, this.state.reconnectAttempts - 1);
          
          console.log(`[Reconnection Handler] Next attempt in ${delay}ms`);
          this.reconnectTimer = setTimeout(attempt, delay);
        }
      } catch (error) {
        console.error('[Reconnection Handler] Reconnect attempt failed:', error);
        
        // Schedule next attempt
        const delay = this.config.reconnectDelay * 
          Math.pow(this.config.backoffMultiplier, this.state.reconnectAttempts - 1);
        
        this.reconnectTimer = setTimeout(attempt, delay);
      }
    };
    
    // Start first attempt immediately
    attempt();
  }
  
  /**
   * Check if connection is available
   * @returns {Promise<boolean>} Connection status
   */
  async checkConnection() {
    return new Promise((resolve) => {
      // Send a test message to check if inject script is responsive
      const testId = `test-${Date.now()}`;
      let responseReceived = false;
      
      const handleResponse = (event) => {
        if (event.data.source === 'vtf-inject' && 
            event.data.type === 'connectionTest' &&
            event.data.data.testId === testId) {
          responseReceived = true;
          window.removeEventListener('message', handleResponse);
          resolve(true);
        }
      };
      
      window.addEventListener('message', handleResponse);
      
      // Send test message
      window.postMessage({
        source: 'vtf-content',
        type: 'connectionTest',
        testId: testId
      }, '*');
      
      // Timeout after 2 seconds
      setTimeout(() => {
        window.removeEventListener('message', handleResponse);
        if (!responseReceived) {
          resolve(false);
        }
      }, 2000);
    });
  }
  
  /**
   * Handle successful reconnection
   */
  async handleReconnectSuccess() {
    console.log('[Reconnection Handler] Reconnection successful');
    
    this.state.lastConnectTime = Date.now();
    this.state.isReconnecting = false;
    this.state.reconnectAttempts = 0;
    
    const reconnectInfo = {
      duration: Date.now() - this.state.lastDisconnectTime,
      attempts: this.state.reconnectAttempts,
      previousCaptures: Array.from(this.state.previousCaptures.keys())
    };
    
    if (this.callbacks.onReconnected) {
      this.callbacks.onReconnected(reconnectInfo);
    }
    
    // Auto-resume captures if enabled
    if (this.config.autoResume && this.state.previousCaptures.size > 0) {
      await this.resumePreviousCaptures();
    }
    
    // Clear previous captures after resuming
    this.state.previousCaptures.clear();
  }
  
  /**
   * Resume previous captures
   */
  async resumePreviousCaptures() {
    console.log('[Reconnection Handler] Resuming previous captures');
    
    const resumePromises = [];
    
    for (const [userId, captureInfo] of this.state.previousCaptures) {
      if (captureInfo.wasCapturing) {
        resumePromises.push(this.resumeCapture(userId));
      }
    }
    
    const results = await Promise.allSettled(resumePromises);
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`[Reconnection Handler] Resumed ${successful} captures, ${failed} failed`);
    
    if (this.callbacks.onStateRestored) {
      this.callbacks.onStateRestored({
        resumed: successful,
        failed: failed,
        total: this.state.previousCaptures.size
      });
    }
  }
  
  /**
   * Resume capture for a specific user
   * @param {string} userId - User ID to resume
   */
  async resumeCapture(userId) {
    return new Promise((resolve, reject) => {
      // Send resume message to inject script
      window.postMessage({
        source: 'vtf-content',
        type: 'resumeCapture',
        userId: userId
      }, '*');
      
      // Wait for confirmation
      const timeout = setTimeout(() => {
        reject(new Error(`Failed to resume capture for ${userId}`));
      }, 5000);
      
      const handleResponse = (event) => {
        if (event.data.source === 'vtf-inject' && 
            event.data.type === 'captureResumed' &&
            event.data.data.userId === userId) {
          clearTimeout(timeout);
          window.removeEventListener('message', handleResponse);
          resolve();
        }
      };
      
      window.addEventListener('message', handleResponse);
    });
  }
  
  /**
   * Cancel ongoing reconnection attempts
   */
  cancelReconnection() {
    console.log('[Reconnection Handler] Cancelling reconnection');
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.state.isReconnecting = false;
    this.state.reconnectAttempts = 0;
  }
  
  /**
   * Get current state
   * @returns {Object} Current state
   */
  getState() {
    return {
      isReconnecting: this.state.isReconnecting,
      reconnectAttempts: this.state.reconnectAttempts,
      timeSinceDisconnect: this.state.lastDisconnectTime 
        ? Date.now() - this.state.lastDisconnectTime 
        : null,
      previousCaptureCount: this.state.previousCaptures.size
    };
  }
  
  /**
   * Reset handler state
   */
  reset() {
    this.cancelReconnection();
    this.state.previousCaptures.clear();
    this.state.reconnectAttempts = 0;
    this.state.lastDisconnectTime = null;
    this.state.lastConnectTime = null;
  }
  
  /**
   * Destroy handler and clean up
   */
  destroy() {
    this.cancelReconnection();
    this.state.previousCaptures.clear();
    
    // Clear all callbacks
    for (const key in this.callbacks) {
      this.callbacks[key] = null;
    }
  }
}

export default ReconnectionHandler; 