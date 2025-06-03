// audio-processor.js - AudioWorklet processor for modern audio handling
class VTFAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
    }
    
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        
        if (input && input[0]) {
            // Copy input to buffer
            const inputData = input[0];
            
            for (let i = 0; i < inputData.length; i++) {
                this.buffer[this.bufferIndex++] = inputData[i];
                
                // When buffer is full, send to main thread
                if (this.bufferIndex >= this.bufferSize) {
                    this.port.postMessage({
                        type: 'audio',
                        data: this.buffer.slice()
                    });
                    this.bufferIndex = 0;
                }
            }
        }
        
        // Keep processor alive
        return true;
    }
}

registerProcessor('vtf-audio-processor', VTFAudioProcessor);