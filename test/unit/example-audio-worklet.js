/**
 * Usage examples for VTF AudioWorklet
 * Shows practical integration patterns
 */

import { VTFAudioWorkletNode } from '../../src/modules/vtf-audio-worklet-node.js';

// Example 1: Basic VTF audio element capture
async function captureVTFAudioElement() {
  console.log('--- Example 1: VTF Audio Element Capture ---');
  
  const context = new AudioContext({ sampleRate: 16000 });
  const workletNode = new VTFAudioWorkletNode(context, 'vtfUser123');
  
  try {
    // Initialize worklet
    await workletNode.initialize();
    
    // Find VTF audio element
    const audioElement = document.getElementById('msRemAudio-vtfUser123');
    if (!audioElement || !audioElement.srcObject) {
      console.log('No VTF audio element found');
      return;
    }
    
    // Create source from element's stream
    const source = context.createMediaStreamSource(audioElement.srcObject);
    
    // Set up audio processing
    workletNode.onAudioData((data) => {
      console.log(`Captured ${data.samples.length} samples from VTF user`);
      // Send to transcription service
    });
    
    // Connect audio graph
    source.connect(workletNode.node);
    
    console.log('Capturing audio from VTF element');
    
  } catch (error) {
    console.error('Capture failed:', error);
  }
}

// Example 2: Multi-user audio capture
async function multiUserCapture() {
  console.log('\n--- Example 2: Multi-User Capture ---');
  
  const context = new AudioContext({ sampleRate: 16000 });
  const activeCaptures = new Map();
  
  // Function to start capture for a user
  async function startUserCapture(userId, stream) {
    console.log(`Starting capture for ${userId}`);
    
    const workletNode = new VTFAudioWorkletNode(context, userId);
    await workletNode.initialize();
    
    const source = context.createMediaStreamSource(stream);
    source.connect(workletNode.node);
    
    workletNode.onAudioData((data) => {
      console.log(`${userId}: ${data.samples.length} samples, peak: ${data.maxSample.toFixed(3)}`);
    });
    
    activeCaptures.set(userId, { workletNode, source });
  }
  
  // Function to stop capture for a user
  function stopUserCapture(userId) {
    const capture = activeCaptures.get(userId);
    if (capture) {
      console.log(`Stopping capture for ${userId}`);
      capture.source.disconnect();
      capture.workletNode.destroy();
      activeCaptures.delete(userId);
    }
  }
  
  // Simulate users joining
  // In real usage, this would be triggered by VTF events
  
  return { startUserCapture, stopUserCapture, activeCaptures };
}

// Example 3: Audio level monitoring
async function audioLevelMonitoring() {
  console.log('\n--- Example 3: Audio Level Monitoring ---');
  
  const context = new AudioContext({ sampleRate: 16000 });
  const workletNode = new VTFAudioWorkletNode(context, 'levelMonitor');
  
  // Audio level display
  const levels = {
    peak: 0,
    rms: 0,
    history: []
  };
  
  await workletNode.initialize();
  
  workletNode.onAudioData((data) => {
    levels.peak = data.maxSample;
    levels.rms = data.rms;
    levels.history.push(data.rms);
    
    // Keep last 100 RMS values
    if (levels.history.length > 100) {
      levels.history.shift();
    }
    
    // Update UI (example)
    updateLevelDisplay(levels);
  });
  
  function updateLevelDisplay(levels) {
    const peakDb = 20 * Math.log10(levels.peak || 0.001);
    const rmsDb = 20 * Math.log10(levels.rms || 0.001);
    
    console.log(`Levels - Peak: ${peakDb.toFixed(1)} dB, RMS: ${rmsDb.toFixed(1)} dB`);
  }
  
  return { workletNode, levels };
}

// Example 4: Adaptive buffer sizing
async function adaptiveBuffering() {
  console.log('\n--- Example 4: Adaptive Buffer Sizing ---');
  
  const context = new AudioContext({ sampleRate: 16000 });
  let currentBufferSize = 4096;
  
  // Create worklet with initial buffer size
  let workletNode = new VTFAudioWorkletNode(context, 'adaptive', {
    bufferSize: currentBufferSize
  });
  
  await workletNode.initialize();
  
  // Monitor network/processing conditions
  let processingDelay = 0;
  let lastChunkTime = Date.now();
  
  workletNode.onAudioData((data) => {
    const now = Date.now();
    processingDelay = now - lastChunkTime;
    lastChunkTime = now;
    
    // Adapt buffer size based on conditions
    if (processingDelay > 500 && currentBufferSize < 16384) {
      // Increase buffer size if processing is slow
      currentBufferSize *= 2;
      console.log(`Increasing buffer size to ${currentBufferSize}`);
      workletNode.updateConfig({ bufferSize: currentBufferSize });
    } else if (processingDelay < 100 && currentBufferSize > 2048) {
      // Decrease buffer size if processing is fast
      currentBufferSize /= 2;
      console.log(`Decreasing buffer size to ${currentBufferSize}`);
      workletNode.updateConfig({ bufferSize: currentBufferSize });
    }
  });
  
  return { workletNode, getCurrentBufferSize: () => currentBufferSize };
}

// Example 5: Integration with VTF extension
async function vtfExtensionIntegration() {
  console.log('\n--- Example 5: VTF Extension Integration ---');
  
  class VTFAudioCaptureManager {
    constructor() {
      this.context = null;
      this.captures = new Map();
      this.dataHandlers = new Map();
    }
    
    async initialize() {
      this.context = new AudioContext({ sampleRate: 16000 });
      console.log('[Audio Manager] Initialized with sample rate:', this.context.sampleRate);
    }
    
    async captureElement(element, userId) {
      if (!element.srcObject) {
        throw new Error('Element has no stream');
      }
      
      // Create worklet node
      const workletNode = new VTFAudioWorkletNode(this.context, userId);
      await workletNode.initialize();
      
      // Create source
      const source = this.context.createMediaStreamSource(element.srcObject);
      source.connect(workletNode.node);
      
      // Set up data handling
      workletNode.onAudioData((data) => {
        const handler = this.dataHandlers.get(userId);
        if (handler) {
          handler(data);
        }
      });
      
      // Store capture info
      this.captures.set(userId, {
        element,
        workletNode,
        source,
        startTime: Date.now()
      });
      
      console.log(`[Audio Manager] Started capture for ${userId}`);
    }
    
    setDataHandler(userId, handler) {
      this.dataHandlers.set(userId, handler);
    }
    
    stopCapture(userId) {
      const capture = this.captures.get(userId);
      if (capture) {
        capture.source.disconnect();
        capture.workletNode.destroy();
        this.captures.delete(userId);
        this.dataHandlers.delete(userId);
        
        const duration = (Date.now() - capture.startTime) / 1000;
        console.log(`[Audio Manager] Stopped capture for ${userId} after ${duration.toFixed(1)}s`);
      }
    }
    
    async getStats() {
      const stats = {
        contextState: this.context.state,
        activeCaptures: this.captures.size,
        captures: []
      };
      
      for (const [userId, capture] of this.captures) {
        const workletStats = await capture.workletNode.getStats();
        stats.captures.push({
          userId,
          duration: (Date.now() - capture.startTime) / 1000,
          ...workletStats
        });
      }
      
      return stats;
    }
    
    destroy() {
      // Stop all captures
      for (const userId of this.captures.keys()) {
        this.stopCapture(userId);
      }
      
      // Close context
      if (this.context) {
        this.context.close();
      }
      
      console.log('[Audio Manager] Destroyed');
    }
  }
  
  // Demo usage
  const manager = new VTFAudioCaptureManager();
  await manager.initialize();
  
  // Simulate VTF audio element
  console.log('[Demo] Audio manager ready for VTF integration');
  
  return manager;
}

// Run all examples
async function runExamples() {
  console.log('🚀 VTF AudioWorklet Usage Examples\n');
  
  await captureVTFAudioElement();
  
  const multiUser = await multiUserCapture();
  console.log('Multi-user system ready:', multiUser);
  
  const levelMonitor = await audioLevelMonitoring();
  console.log('Level monitor ready:', levelMonitor);
  
  const adaptive = await adaptiveBuffering();
  console.log('Adaptive buffer ready:', adaptive);
  
  const manager = await vtfExtensionIntegration();
  console.log('VTF integration ready:', manager);
  
  console.log('\n✨ Examples completed!');
}

// Export examples
export {
  captureVTFAudioElement,
  multiUserCapture,
  audioLevelMonitoring,
  adaptiveBuffering,
  vtfExtensionIntegration,
  runExamples
};

// Auto-run if accessed directly
if (typeof window !== 'undefined' && window.location.href.includes('example')) {
  runExamples();
}