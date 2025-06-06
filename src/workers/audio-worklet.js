/**
 * VTFAudioProcessor - AudioWorklet for high-performance audio processing
 * 
 * This processor runs on the audio rendering thread, capturing and buffering
 * audio data from VTF audio elements. It accumulates 128-sample chunks into
 * larger buffers (4096 samples) before sending to the main thread.
 * 
 * @module audio-worklet
 */

class VTFAudioProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [];
    }
    
    constructor(options) {
      super();
      
      // Extract configuration from options
      this.userId = options.processorOptions?.userId || 'unknown';
      this.bufferSize = options.processorOptions?.bufferSize || 4096;
      this.silenceThreshold = options.processorOptions?.silenceThreshold || 0.001;
      
      // Internal state
      this.buffer = [];
      this.isActive = true;
      this.samplesProcessed = 0;
      this.chunksSkipped = 0;
      this.chunksSent = 0;
      
      // Performance tracking
      this.startTime = currentTime;
      this.lastMessageTime = currentTime;
      
      // Set up message handling from main thread
      this.port.onmessage = (event) => {
        this.handleMessage(event.data);
      };
      
      // Send initialization confirmation
      this.port.postMessage({
        type: 'initialized',
        userId: this.userId,
        bufferSize: this.bufferSize
      });
    }
    
    /**
     * Process audio data - called every 128 samples
     * @param {Float32Array[][]} inputs - Input audio data
     * @param {Float32Array[][]} outputs - Output audio data (passthrough)
     * @param {Object} parameters - AudioParam values
     * @returns {boolean} - True to keep processor alive
     */
    process(inputs, outputs, parameters) {
      // Stop processing if inactive
      if (!this.isActive) {
        return false; // This terminates the processor
      }
      
      // Get first input (mono or first channel of stereo)
      const input = inputs[0];
      if (!input || input.length === 0) {
        return true; // No input connected, keep alive
      }
      
      // Get first channel data
      const channelData = input[0];
      if (!channelData || channelData.length === 0) {
        return true; // No channel data, keep alive
      }
      
      // Process this quantum (128 samples)
      this.processQuantum(channelData);
      
      // Passthrough audio to output if connected
      if (outputs[0] && outputs[0][0]) {
        outputs[0][0].set(channelData);
      }
      
      return true; // Keep processor alive
    }
    
    /**
     * Process a single quantum of audio data
     * @private
     * @param {Float32Array} samples - 128 samples of audio data
     */
    processQuantum(samples) {
      // Update sample count
      this.samplesProcessed += samples.length;
      
      // Check if this quantum contains audio (not silence)
      let maxSample = 0;
      for (let i = 0; i < samples.length; i++) {
        const absSample = Math.abs(samples[i]);
        if (absSample > maxSample) {
          maxSample = absSample;
        }
      }
      
      // Skip silent chunks to save processing
      if (maxSample < this.silenceThreshold) {
        this.chunksSkipped++;
        // Don't add to buffer, but continue processing
        // This allows us to detect when audio resumes
        return;
      }
      
      // Add samples to buffer
      for (let i = 0; i < samples.length; i++) {
        this.buffer.push(samples[i]);
      }
      
      // Check if we have enough samples for a chunk
      while (this.buffer.length >= this.bufferSize) {
        this.sendChunk();
      }
    }
    
    /**
     * Send a complete chunk to the main thread
     * @private
     */
    sendChunk() {
      // Extract chunk from buffer
      const chunk = this.buffer.splice(0, this.bufferSize);
      
      // Calculate chunk statistics
      let maxSample = 0;
      let sumSquares = 0;
      
      for (let i = 0; i < chunk.length; i++) {
        const sample = chunk[i];
        const absSample = Math.abs(sample);
        if (absSample > maxSample) {
          maxSample = absSample;
        }
        sumSquares += sample * sample;
      }
      
      const rms = Math.sqrt(sumSquares / chunk.length);
      
      // Send to main thread
      this.port.postMessage({
        type: 'audioData',
        userId: this.userId,
        samples: chunk,
        timestamp: currentTime,
        maxSample: maxSample,
        rms: rms,
        chunkIndex: this.chunksSent
      });
      
      this.chunksSent++;
      this.lastMessageTime = currentTime;
    }
    
    /**
     * Handle messages from main thread
     * @private
     * @param {Object} data - Message data
     */
    handleMessage(data) {
      switch (data.command) {
        case 'stop':
          console.log(`[Audio Worklet] Stopping processor for ${this.userId}`);
          this.isActive = false;
          // Send any remaining buffered audio
          if (this.buffer.length > 0) {
            this.sendChunk();
          }
          // Send final stats
          this.sendStats();
          break;
          
        case 'getStats':
          this.sendStats();
          break;
          
        case 'updateConfig':
          if (data.config) {
            if (typeof data.config.bufferSize === 'number') {
              this.bufferSize = data.config.bufferSize;
            }
            if (typeof data.config.silenceThreshold === 'number') {
              this.silenceThreshold = data.config.silenceThreshold;
            }
          }
          break;
          
        case 'flush':
          // Force send any buffered audio
          if (this.buffer.length > 0) {
            this.sendChunk();
          }
          break;
          
        default:
          console.warn(`[Audio Worklet] Unknown command: ${data.command}`);
      }
    }
    
    /**
     * Send processor statistics to main thread
     * @private
     */
    sendStats() {
      const uptime = currentTime - this.startTime;
      const stats = {
        type: 'stats',
        userId: this.userId,
        uptime: uptime,
        samplesProcessed: this.samplesProcessed,
        chunksSkipped: this.chunksSkipped,
        chunksSent: this.chunksSent,
        bufferLength: this.buffer.length,
        averageChunkRate: uptime > 0 ? this.chunksSent / uptime : 0,
        isActive: this.isActive
      };
      
      this.port.postMessage(stats);
    }
  }
  
  // Register the processor
  registerProcessor('vtf-audio-processor', VTFAudioProcessor);
  
  // Log registration (will appear in console when worklet loads)
  console.log('[Audio Worklet] VTF Audio Processor registered');