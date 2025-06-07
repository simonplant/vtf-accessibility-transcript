/**
 * Adaptive Buffer Management
 * Dynamically adjusts buffer size based on speech patterns and performance
 */
export class AdaptiveBuffer {
  constructor(options = {}) {
    this.config = {
      minDuration: 2.0,        // Minimum buffer duration (seconds)
      maxDuration: 30.0,       // Maximum buffer duration (seconds)
      targetDuration: 10.0,    // Initial target duration
      silenceThreshold: 0.001, // Silence detection threshold
      speechEndTimeout: 1.5,   // Time to wait after speech ends (seconds)
      adaptationRate: 0.1,     // How quickly to adapt (0-1)
      ...options
    };
    
    this.state = {
      currentDuration: this.config.targetDuration,
      speechActive: false,
      lastSpeechTime: null,
      silenceDuration: 0,
      totalSamples: 0,
      metrics: {
        avgTranscriptionTime: 0,
        avgChunkDuration: 0,
        networkLatency: 0,
        successRate: 1.0
      }
    };
    
    this.samples = [];
    this.startTime = Date.now();
    this.lastChunkTime = Date.now();
  }
  
  /**
   * Add audio samples to buffer
   * @param {Float32Array} newSamples - Audio samples to add
   * @param {number} sampleRate - Sample rate (default 16000)
   * @returns {Object|null} Extracted chunk if ready, null otherwise
   */
  addSamples(newSamples, sampleRate = 16000) {
    if (!newSamples || newSamples.length === 0) return null;
    
    // Detect if speech is active
    const isSpeech = this.detectSpeech(newSamples);
    
    // Update speech state
    if (isSpeech) {
      this.state.speechActive = true;
      this.state.lastSpeechTime = Date.now();
      this.state.silenceDuration = 0;
    } else {
      this.state.silenceDuration += newSamples.length / sampleRate;
    }
    
    // Add samples to buffer
    this.samples.push(...newSamples);
    this.state.totalSamples += newSamples.length;
    
    // Check if we should extract a chunk
    const shouldExtract = this.shouldExtractChunk(sampleRate);
    
    if (shouldExtract) {
      return this.extractChunk(sampleRate);
    }
    
    return null;
  }
  
  /**
   * Detect if samples contain speech
   * @param {Float32Array} samples - Audio samples
   * @returns {boolean} True if speech detected
   */
  detectSpeech(samples) {
    // Calculate RMS (Root Mean Square)
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSquares += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSquares / samples.length);
    
    // Also check for peak values
    const maxValue = Math.max(...samples.map(Math.abs));
    
    // Speech detection based on RMS and peak
    return rms > this.config.silenceThreshold || 
           maxValue > this.config.silenceThreshold * 3;
  }
  
  /**
   * Determine if chunk should be extracted
   * @param {number} sampleRate - Sample rate
   * @returns {boolean} True if chunk should be extracted
   */
  shouldExtractChunk(sampleRate) {
    const currentDuration = this.samples.length / sampleRate;
    
    // Always extract if we hit max duration
    if (currentDuration >= this.config.maxDuration) {
      return true;
    }
    
    // Don't extract if below minimum duration
    if (currentDuration < this.config.minDuration) {
      return false;
    }
    
    // Extract based on adaptive duration
    if (currentDuration >= this.state.currentDuration) {
      return true;
    }
    
    // Extract if speech ended and we've waited long enough
    if (this.state.speechActive && 
        !this.detectSpeech(this.samples.slice(-sampleRate)) &&
        this.state.silenceDuration >= this.config.speechEndTimeout) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Extract chunk from buffer
   * @param {number} sampleRate - Sample rate
   * @returns {Object} Extracted chunk data
   */
  extractChunk(sampleRate) {
    const chunk = {
      samples: new Float32Array(this.samples),
      duration: this.samples.length / sampleRate,
      startTime: this.startTime,
      endTime: Date.now(),
      speechDetected: this.state.speechActive,
      metrics: {
        silenceRatio: this.calculateSilenceRatio(),
        avgLevel: this.calculateAvgLevel()
      }
    };
    
    // Update adaptation based on chunk
    this.adaptDuration(chunk);
    
    // Reset buffer
    this.samples = [];
    this.startTime = Date.now();
    this.lastChunkTime = Date.now();
    this.state.speechActive = false;
    this.state.silenceDuration = 0;
    
    return chunk;
  }
  
  /**
   * Adapt buffer duration based on performance
   * @param {Object} chunk - Extracted chunk
   */
  adaptDuration(chunk) {
    // Factors to consider:
    // 1. Chunk duration vs target
    // 2. Speech patterns
    // 3. Network performance
    // 4. Success rate
    
    let adjustment = 0;
    
    // If chunk was mostly silence, increase duration
    if (chunk.metrics.silenceRatio > 0.7) {
      adjustment += 2.0; // Increase by 2 seconds
    }
    
    // If network is slow, use smaller chunks
    if (this.state.metrics.networkLatency > 2000) {
      adjustment -= 2.0; // Decrease by 2 seconds
    }
    
    // If transcription success rate is low, try different size
    if (this.state.metrics.successRate < 0.8) {
      adjustment -= 1.0; // Decrease by 1 second
    }
    
    // Apply adjustment with adaptation rate
    const newDuration = this.state.currentDuration + 
      (adjustment * this.config.adaptationRate);
    
    // Clamp to bounds
    this.state.currentDuration = Math.max(
      this.config.minDuration,
      Math.min(this.config.maxDuration, newDuration)
    );
    
    console.log(`[Adaptive Buffer] Duration adjusted to ${this.state.currentDuration}s`);
  }
  
  /**
   * Calculate silence ratio in buffer
   * @returns {number} Ratio of silence (0-1)
   */
  calculateSilenceRatio() {
    if (this.samples.length === 0) return 1.0;
    
    let silentSamples = 0;
    for (let i = 0; i < this.samples.length; i++) {
      if (Math.abs(this.samples[i]) < this.config.silenceThreshold) {
        silentSamples++;
      }
    }
    
    return silentSamples / this.samples.length;
  }
  
  /**
   * Calculate average level
   * @returns {number} Average absolute level
   */
  calculateAvgLevel() {
    if (this.samples.length === 0) return 0;
    
    let sum = 0;
    for (let i = 0; i < this.samples.length; i++) {
      sum += Math.abs(this.samples[i]);
    }
    
    return sum / this.samples.length;
  }
  
  /**
   * Update performance metrics
   * @param {Object} metrics - Performance metrics
   */
  updateMetrics(metrics) {
    // Use exponential moving average
    const alpha = 0.2;
    
    if (metrics.transcriptionTime !== undefined) {
      this.state.metrics.avgTranscriptionTime = 
        alpha * metrics.transcriptionTime + 
        (1 - alpha) * this.state.metrics.avgTranscriptionTime;
    }
    
    if (metrics.networkLatency !== undefined) {
      this.state.metrics.networkLatency = 
        alpha * metrics.networkLatency + 
        (1 - alpha) * this.state.metrics.networkLatency;
    }
    
    if (metrics.success !== undefined) {
      this.state.metrics.successRate = 
        alpha * (metrics.success ? 1 : 0) + 
        (1 - alpha) * this.state.metrics.successRate;
    }
  }
  
  /**
   * Force extraction of current buffer
   * @param {number} sampleRate - Sample rate
   * @returns {Object|null} Extracted chunk or null if empty
   */
  forceExtract(sampleRate = 16000) {
    if (this.samples.length === 0) return null;
    return this.extractChunk(sampleRate);
  }
  
  /**
   * Get current buffer statistics
   * @returns {Object} Buffer statistics
   */
  getStats() {
    return {
      currentDuration: this.state.currentDuration,
      bufferSize: this.samples.length,
      bufferDuration: this.samples.length / 16000,
      speechActive: this.state.speechActive,
      silenceDuration: this.state.silenceDuration,
      metrics: { ...this.state.metrics }
    };
  }
  
  /**
   * Reset buffer and state
   */
  reset() {
    this.samples = [];
    this.startTime = Date.now();
    this.state.speechActive = false;
    this.state.silenceDuration = 0;
    this.state.currentDuration = this.config.targetDuration;
  }
}

export default AdaptiveBuffer; 