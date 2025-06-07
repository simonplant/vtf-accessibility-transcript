/**
 * Circuit Breaker for API calls
 * Prevents cascading failures by temporarily disabling calls after repeated failures
 */
export class CircuitBreaker {
  constructor(options = {}) {
    this.config = {
      failureThreshold: 5,        // Number of failures before opening
      resetTimeout: 60000,        // Time before trying again (ms)
      monitoringPeriod: 120000,   // Period for failure rate calculation
      failureRateThreshold: 0.5,  // Failure rate to trigger opening
      halfOpenRequests: 2,        // Number of test requests in half-open state
      ...options
    };
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.halfOpenAttempts = 0;
    
    // Sliding window for failure rate
    this.requestHistory = [];
    
    // Callbacks
    this.onStateChange = null;
    this.onFailure = null;
  }
  
  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Async function to execute
   * @param {any} fallback - Fallback value if circuit is open
   * @returns {Promise<any>} Result or fallback
   */
  async execute(fn, fallback = null) {
    // Check if circuit should be reset to half-open
    this.checkStateTransition();
    
    if (this.state === 'OPEN') {
      console.warn('[Circuit Breaker] Circuit is OPEN, returning fallback');
      return fallback;
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onError(error);
      throw error;
    }
  }
  
  /**
   * Record successful execution
   */
  onSuccess() {
    this.successes++;
    this.recordRequest(true);
    
    if (this.state === 'HALF_OPEN') {
      this.halfOpenAttempts++;
      
      if (this.halfOpenAttempts >= this.config.halfOpenRequests) {
        // Enough successful requests, close the circuit
        this.close();
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success
      this.failures = 0;
    }
  }
  
  /**
   * Record failed execution
   * @param {Error} error - The error that occurred
   */
  onError(error) {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.recordRequest(false);
    
    if (this.onFailure) {
      this.onFailure(error, this.failures);
    }
    
    if (this.state === 'HALF_OPEN') {
      // Any failure in half-open state reopens the circuit
      this.open();
    } else if (this.state === 'CLOSED') {
      // Check if we should open the circuit
      if (this.shouldOpen()) {
        this.open();
      }
    }
  }
  
  /**
   * Check if circuit should be opened
   * @returns {boolean} Whether to open the circuit
   */
  shouldOpen() {
    // Check absolute failure threshold
    if (this.failures >= this.config.failureThreshold) {
      return true;
    }
    
    // Check failure rate
    const recentRequests = this.getRecentRequests();
    if (recentRequests.length >= 10) { // Need minimum requests
      const failureRate = this.calculateFailureRate(recentRequests);
      return failureRate >= this.config.failureRateThreshold;
    }
    
    return false;
  }
  
  /**
   * Record a request in the sliding window
   * @param {boolean} success - Whether the request succeeded
   */
  recordRequest(success) {
    this.requestHistory.push({
      timestamp: Date.now(),
      success
    });
    
    // Clean old entries
    const cutoff = Date.now() - this.config.monitoringPeriod;
    this.requestHistory = this.requestHistory.filter(r => r.timestamp > cutoff);
  }
  
  /**
   * Get recent requests within monitoring period
   * @returns {Array} Recent requests
   */
  getRecentRequests() {
    const cutoff = Date.now() - this.config.monitoringPeriod;
    return this.requestHistory.filter(r => r.timestamp > cutoff);
  }
  
  /**
   * Calculate failure rate from requests
   * @param {Array} requests - Request history
   * @returns {number} Failure rate (0-1)
   */
  calculateFailureRate(requests) {
    if (requests.length === 0) return 0;
    
    const failures = requests.filter(r => !r.success).length;
    return failures / requests.length;
  }
  
  /**
   * Check if state should transition
   */
  checkStateTransition() {
    if (this.state === 'OPEN' && Date.now() >= this.nextAttemptTime) {
      this.halfOpen();
    }
  }
  
  /**
   * Open the circuit
   */
  open() {
    console.warn('[Circuit Breaker] Opening circuit');
    
    const previousState = this.state;
    this.state = 'OPEN';
    this.nextAttemptTime = Date.now() + this.config.resetTimeout;
    
    if (this.onStateChange && previousState !== 'OPEN') {
      this.onStateChange('OPEN', {
        failures: this.failures,
        failureRate: this.calculateFailureRate(this.getRecentRequests()),
        nextAttemptTime: this.nextAttemptTime
      });
    }
  }
  
  /**
   * Close the circuit
   */
  close() {
    console.log('[Circuit Breaker] Closing circuit');
    
    const previousState = this.state;
    this.state = 'CLOSED';
    this.failures = 0;
    this.halfOpenAttempts = 0;
    this.nextAttemptTime = null;
    
    if (this.onStateChange && previousState !== 'CLOSED') {
      this.onStateChange('CLOSED', {
        successes: this.successes
      });
    }
  }
  
  /**
   * Set circuit to half-open state
   */
  halfOpen() {
    console.log('[Circuit Breaker] Setting circuit to HALF_OPEN');
    
    const previousState = this.state;
    this.state = 'HALF_OPEN';
    this.halfOpenAttempts = 0;
    
    if (this.onStateChange && previousState !== 'HALF_OPEN') {
      this.onStateChange('HALF_OPEN', {
        testRequests: this.config.halfOpenRequests
      });
    }
  }
  
  /**
   * Force circuit to close
   */
  forceClose() {
    this.close();
    this.requestHistory = [];
  }
  
  /**
   * Force circuit to open
   */
  forceOpen() {
    this.open();
  }
  
  /**
   * Get current state information
   * @returns {Object} State information
   */
  getState() {
    const recentRequests = this.getRecentRequests();
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      failureRate: this.calculateFailureRate(recentRequests),
      totalRequests: recentRequests.length,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      timeUntilReset: this.nextAttemptTime ? 
        Math.max(0, this.nextAttemptTime - Date.now()) : null
    };
  }
  
  /**
   * Reset all statistics
   */
  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.halfOpenAttempts = 0;
    this.requestHistory = [];
  }
}

export default CircuitBreaker; 