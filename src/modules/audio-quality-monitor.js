/**
 * Audio Quality Monitor
 * Monitors audio quality metrics for better transcription results
 */
export class AudioQualityMonitor {
  constructor(config = {}) {
    this.config = {
      silenceThreshold: 0.001,
      clippingThreshold: 0.99,
      minSNR: 10, // dB
      windowSize: 4096,
      ...config
    };
    
    this.metrics = {
      totalSamples: 0,
      silentSamples: 0,
      clippedSamples: 0,
      avgLevel: 0,
      peakLevel: 0,
      lastSNR: 0
    };
  }
  
  /**
   * Analyze audio samples and return quality metrics
   * @param {Float32Array} samples - Audio samples
   * @returns {Object} Quality metrics
   */
  analyze(samples) {
    if (!samples || samples.length === 0) {
      return { quality: 'no-data', issues: ['No audio data'] };
    }
    
    const metrics = {
      clipping: this.detectClipping(samples),
      silence: this.detectSilence(samples),
      level: this.calculateLevel(samples),
      snr: this.estimateSNR(samples),
      quality: 'good',
      issues: []
    };
    
    // Determine overall quality
    if (metrics.silence.ratio > 0.95) {
      metrics.quality = 'silent';
      metrics.issues.push('Audio is mostly silent');
    } else if (metrics.clipping.ratio > 0.01) {
      metrics.quality = 'poor';
      metrics.issues.push('Audio is clipping (too loud)');
    } else if (metrics.snr < this.config.minSNR) {
      metrics.quality = 'fair';
      metrics.issues.push('Low signal-to-noise ratio');
    } else if (metrics.level.avg < 0.1) {
      metrics.quality = 'fair';
      metrics.issues.push('Audio level is very low');
    }
    
    // Update running metrics
    this.updateMetrics(samples, metrics);
    
    return metrics;
  }
  
  /**
   * Detect audio clipping
   * @param {Float32Array} samples
   * @returns {Object} Clipping metrics
   */
  detectClipping(samples) {
    let clippedCount = 0;
    let consecutiveClipped = 0;
    let maxConsecutive = 0;
    
    for (let i = 0; i < samples.length; i++) {
      const absValue = Math.abs(samples[i]);
      
      if (absValue >= this.config.clippingThreshold) {
        clippedCount++;
        consecutiveClipped++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveClipped);
      } else {
        consecutiveClipped = 0;
      }
    }
    
    return {
      count: clippedCount,
      ratio: clippedCount / samples.length,
      maxConsecutive: maxConsecutive,
      isClipping: clippedCount > samples.length * 0.001
    };
  }
  
  /**
   * Detect silence in audio
   * @param {Float32Array} samples
   * @returns {Object} Silence metrics
   */
  detectSilence(samples) {
    let silentCount = 0;
    let consecutiveSilent = 0;
    let maxConsecutive = 0;
    
    for (let i = 0; i < samples.length; i++) {
      const absValue = Math.abs(samples[i]);
      
      if (absValue < this.config.silenceThreshold) {
        silentCount++;
        consecutiveSilent++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveSilent);
      } else {
        consecutiveSilent = 0;
      }
    }
    
    return {
      count: silentCount,
      ratio: silentCount / samples.length,
      maxConsecutive: maxConsecutive,
      isSilent: silentCount > samples.length * 0.9
    };
  }
  
  /**
   * Calculate audio level metrics
   * @param {Float32Array} samples
   * @returns {Object} Level metrics
   */
  calculateLevel(samples) {
    let sum = 0;
    let peak = 0;
    
    for (let i = 0; i < samples.length; i++) {
      const absValue = Math.abs(samples[i]);
      sum += absValue;
      peak = Math.max(peak, absValue);
    }
    
    const avg = sum / samples.length;
    const rms = Math.sqrt(
      samples.reduce((acc, val) => acc + val * val, 0) / samples.length
    );
    
    return {
      avg: avg,
      peak: peak,
      rms: rms,
      rmsDb: 20 * Math.log10(Math.max(rms, 1e-10))
    };
  }
  
  /**
   * Estimate signal-to-noise ratio
   * @param {Float32Array} samples
   * @returns {number} SNR in dB
   */
  estimateSNR(samples) {
    // Simple SNR estimation using frame energy variance
    const frameSize = 256;
    const frameCount = Math.floor(samples.length / frameSize);
    
    if (frameCount < 2) return 0;
    
    const frameEnergies = [];
    
    for (let i = 0; i < frameCount; i++) {
      let energy = 0;
      const start = i * frameSize;
      
      for (let j = 0; j < frameSize; j++) {
        const sample = samples[start + j] || 0;
        energy += sample * sample;
      }
      
      frameEnergies.push(energy / frameSize);
    }
    
    // Sort energies to separate signal and noise
    frameEnergies.sort((a, b) => a - b);
    
    // Assume bottom 20% is noise, top 20% is signal
    const noiseFrames = Math.floor(frameCount * 0.2);
    const signalFrames = Math.floor(frameCount * 0.2);
    
    let noiseEnergy = 0;
    let signalEnergy = 0;
    
    for (let i = 0; i < noiseFrames; i++) {
      noiseEnergy += frameEnergies[i];
    }
    
    for (let i = frameCount - signalFrames; i < frameCount; i++) {
      signalEnergy += frameEnergies[i];
    }
    
    noiseEnergy /= noiseFrames;
    signalEnergy /= signalFrames;
    
    if (noiseEnergy < 1e-10) return 60; // Very quiet, assume good SNR
    
    const snr = 10 * Math.log10(signalEnergy / noiseEnergy);
    return Math.max(0, Math.min(60, snr)); // Clamp to reasonable range
  }
  
  /**
   * Update running metrics
   * @param {Float32Array} samples
   * @param {Object} currentMetrics
   */
  updateMetrics(samples, currentMetrics) {
    this.metrics.totalSamples += samples.length;
    this.metrics.silentSamples += currentMetrics.silence.count;
    this.metrics.clippedSamples += currentMetrics.clipping.count;
    this.metrics.peakLevel = Math.max(this.metrics.peakLevel, currentMetrics.level.peak);
    this.metrics.lastSNR = currentMetrics.snr;
    
    // Update average level with exponential moving average
    const alpha = 0.1;
    this.metrics.avgLevel = alpha * currentMetrics.level.avg + 
                            (1 - alpha) * this.metrics.avgLevel;
  }
  
  /**
   * Get overall statistics
   * @returns {Object} Overall metrics
   */
  getStats() {
    return {
      ...this.metrics,
      silenceRatio: this.metrics.totalSamples > 0 
        ? this.metrics.silentSamples / this.metrics.totalSamples 
        : 0,
      clippingRatio: this.metrics.totalSamples > 0 
        ? this.metrics.clippedSamples / this.metrics.totalSamples 
        : 0
    };
  }
  
  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {
      totalSamples: 0,
      silentSamples: 0,
      clippedSamples: 0,
      avgLevel: 0,
      peakLevel: 0,
      lastSNR: 0
    };
  }
}

export default AudioQualityMonitor; 