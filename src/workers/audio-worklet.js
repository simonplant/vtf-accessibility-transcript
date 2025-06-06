

class VTFAudioProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [];
    }
    
    constructor(options) {
      super();
      
      
      this.userId = options.processorOptions?.userId || 'unknown';
      this.bufferSize = options.processorOptions?.bufferSize || 4096;
      this.silenceThreshold = options.processorOptions?.silenceThreshold || 0.001;
      
      
      this.buffer = [];
      this.isActive = true;
      this.samplesProcessed = 0;
      this.chunksSkipped = 0;
      this.chunksSent = 0;
      
      
      this.startTime = currentTime;
      this.lastMessageTime = currentTime;
      
      
      this.port.onmessage = (event) => {
        this.handleMessage(event.data);
      };
      
      
      this.port.postMessage({
        type: 'initialized',
        userId: this.userId,
        bufferSize: this.bufferSize
      });
    }
    
    
    process(inputs, outputs, parameters) {
      
      if (!this.isActive) {
        return false; 
      }
      
      
      const input = inputs[0];
      if (!input || input.length === 0) {
        return true; 
      }
      
      
      const channelData = input[0];
      if (!channelData || channelData.length === 0) {
        return true; 
      }
      
      
      this.processQuantum(channelData);
      
      
      if (outputs[0] && outputs[0][0]) {
        outputs[0][0].set(channelData);
      }
      
      return true; 
    }
    
    
    processQuantum(samples) {
      
      this.samplesProcessed += samples.length;
      
      
      let maxSample = 0;
      for (let i = 0; i < samples.length; i++) {
        const absSample = Math.abs(samples[i]);
        if (absSample > maxSample) {
          maxSample = absSample;
        }
      }
      
      
      if (maxSample < this.silenceThreshold) {
        this.chunksSkipped++;
        
        
        return;
      }
      
      
      for (let i = 0; i < samples.length; i++) {
        this.buffer.push(samples[i]);
      }
      
      
      while (this.buffer.length >= this.bufferSize) {
        this.sendChunk();
      }
    }
    
    
    sendChunk() {
      
      const chunk = this.buffer.splice(0, this.bufferSize);
      
      
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
    
    
    handleMessage(data) {
      switch (data.command) {
        case 'stop':
          
          this.isActive = false;
          
          if (this.buffer.length > 0) {
            this.sendChunk();
          }
          
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
          
          if (this.buffer.length > 0) {
            this.sendChunk();
          }
          break;
          
        default:
          
      }
    }
    
    
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
  
  
  registerProcessor('vtf-audio-processor', VTFAudioProcessor);
  
  
  