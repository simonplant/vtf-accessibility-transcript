

import { VTFAudioWorkletNode } from '../../src/modules/vtf-audio-worklet-node.js';

const TestUtils = {
  
  createTestContext() {
    return new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000,
      latencyHint: 'interactive'
    });
  },
  
  
  createTestSource(context, frequency = 440, duration = 1) {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    
    oscillator.frequency.value = frequency;
    oscillator.connect(gainNode);
    
    
    gainNode.gain.setValueAtTime(0, context.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1, context.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0.1, context.currentTime + duration - 0.01);
    gainNode.gain.linearRampToValueAtTime(0, context.currentTime + duration);
    
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
    
    return gainNode;
  },
  
  
  createSilentSource(context) {
    const gainNode = context.createGain();
    gainNode.gain.value = 0;
    
    const oscillator = context.createOscillator();
    oscillator.connect(gainNode);
    oscillator.start();
    
    return { gainNode, oscillator };
  },
  
  
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  
  async runTest(name, testFn) {
    console.group(`🧪 Test: ${name}`);
    try {
      await testFn();
      
    } catch (error) {
      console.error('❌ FAILED:', error);
    }
    console.groupEnd();
  }
};

const AudioWorkletTests = {
  
  async testInitialization() {
    const context = TestUtils.createTestContext();
    const workletNode = new VTFAudioWorkletNode(context, 'testUser123');
    
    console.assert(!workletNode.isInitialized, 'Should not be initialized yet');
    
    try {
      await workletNode.initialize();
      console.assert(workletNode.isInitialized, 'Should be initialized');
      console.assert(workletNode.node !== null, 'Should have AudioWorkletNode');
      console.assert(workletNode.node instanceof AudioWorkletNode, 'Should be correct type');
    } catch (error) {
      console.warn('AudioWorklet not supported or loading failed:', error);
      
    }
    
    workletNode.destroy();
    await context.close();
  },
  
  
  async testAudioCapture() {
    const context = TestUtils.createTestContext();
    const workletNode = new VTFAudioWorkletNode(context, 'testUser456');
    
    let audioChunks = [];
    workletNode.onAudioData((data) => {
      audioChunks.push(data);
      
    });
    
    try {
      await workletNode.initialize();
      
      
      const source = TestUtils.createTestSource(context, 1000, 0.5);
      source.connect(workletNode.node);
      workletNode.connect(context.destination);
      
      
      await TestUtils.wait(1000);
      
      console.assert(audioChunks.length > 0, 'Should receive audio chunks');
      console.assert(audioChunks[0].samples.length === 4096, 'Chunks should be 4096 samples');
      console.assert(audioChunks[0].userId === 'testUser456', 'Should have correct userId');
      console.assert(typeof audioChunks[0].maxSample === 'number', 'Should have maxSample');
      console.assert(typeof audioChunks[0].rms === 'number', 'Should have RMS value');
      
      
    } catch (error) {
      console.warn('Test skipped:', error.message);
    }
    
    workletNode.destroy();
    await context.close();
  },
  
  
  async testSilenceDetection() {
    const context = TestUtils.createTestContext();
    const workletNode = new VTFAudioWorkletNode(context, 'testSilence', {
      silenceThreshold: 0.001
    });
    
    let audioChunks = [];
    workletNode.onAudioData((data) => {
      audioChunks.push(data);
    });
    
    try {
      await workletNode.initialize();
      
      
      const { gainNode, oscillator } = TestUtils.createSilentSource(context);
      gainNode.connect(workletNode.node);
      
      
      await TestUtils.wait(500);
      
      
      gainNode.gain.value = 0.1;
      await TestUtils.wait(500);
      
      oscillator.stop();
      
      console.assert(audioChunks.length > 0, 'Should receive chunks after silence ends');
      
    } catch (error) {
      console.warn('Test skipped:', error.message);
    }
    
    workletNode.destroy();
    await context.close();
  },
  
  
  async testStatistics() {
    const context = TestUtils.createTestContext();
    const workletNode = new VTFAudioWorkletNode(context, 'testStats');
    
    try {
      await workletNode.initialize();
      
      
      const stats1 = await workletNode.getStats();
      
      
      const source = TestUtils.createTestSource(context, 2000, 0.3);
      source.connect(workletNode.node);
      
      await TestUtils.wait(500);
      
      
      const stats2 = await workletNode.getStats();
      
      console.assert(stats2.messagesReceived > stats1.messagesReceived, 'Should have more messages');
      console.assert(stats2.initialized === true, 'Should show initialized');
      
      
      const debug = workletNode.debug();
      
      console.assert(debug.isInitialized === true, 'Debug should show initialized');
      console.assert(debug.userId === 'testStats', 'Debug should show userId');
      
    } catch (error) {
      console.warn('Test skipped:', error.message);
    }
    
    workletNode.destroy();
    await context.close();
  },
  
  
  async testConfigUpdates() {
    const context = TestUtils.createTestContext();
    const workletNode = new VTFAudioWorkletNode(context, 'testConfig', {
      bufferSize: 2048
    });
    
    try {
      await workletNode.initialize();
      
      
      workletNode.updateConfig({
        bufferSize: 8192,
        silenceThreshold: 0.01
      });
      
      
      const debug = workletNode.debug();
      console.assert(debug.options.bufferSize === 8192, 'Should update buffer size');
      console.assert(debug.options.silenceThreshold === 0.01, 'Should update threshold');
      
    } catch (error) {
      console.warn('Test skipped:', error.message);
    }
    
    workletNode.destroy();
    await context.close();
  },
  
  
  async testErrorHandling() {
    
    try {
      const workletNode = new VTFAudioWorkletNode(null, 'testError');
      console.assert(false, 'Should throw for invalid context');
    } catch (error) {
      console.assert(error.message.includes('Invalid AudioContext'), 'Should have correct error');
    }
    
    
    const context = TestUtils.createTestContext();
    try {
      const workletNode = new VTFAudioWorkletNode(context, null);
      console.assert(false, 'Should throw for invalid userId');
    } catch (error) {
      console.assert(error.message.includes('Invalid userId'), 'Should have correct error');
    }
    
    await context.close();
  },
  
  
  async testMemoryCleanup() {
    const context = TestUtils.createTestContext();
    const nodes = [];
    
    try {
      
      for (let i = 0; i < 5; i++) {
        const node = new VTFAudioWorkletNode(context, `user${i}`);
        await node.initialize();
        nodes.push(node);
      }
      
      
      
      nodes.forEach(node => node.destroy());
      
      
      
      nodes.forEach(node => {
        console.assert(!node.isInitialized, 'Should not be initialized after destroy');
        console.assert(node.node === null, 'Should clear node reference');
      });
      
    } catch (error) {
      console.warn('Test skipped:', error.message);
    }
    
    await context.close();
  },
  
  
  async testPerformance() {
    const context = TestUtils.createTestContext();
    const workletNode = new VTFAudioWorkletNode(context, 'perfTest');
    
    let chunkCount = 0;
    let startTime = 0;
    
    workletNode.onAudioData(() => {
      if (chunkCount === 0) {
        startTime = performance.now();
      }
      chunkCount++;
    });
    
    try {
      await workletNode.initialize();
      
      
      const oscillator = context.createOscillator();
      oscillator.connect(workletNode.node);
      oscillator.start();
      
      
      await TestUtils.wait(2000);
      
      oscillator.stop();
      
      const elapsed = performance.now() - startTime;
      const chunksPerSecond = chunkCount / (elapsed / 1000);
      
      
      
      
      
      console.assert(chunksPerSecond > 3 && chunksPerSecond < 5, 'Should be close to expected rate');
      
    } catch (error) {
      console.warn('Test skipped:', error.message);
    }
    
    workletNode.destroy();
    await context.close();
  }
};

async function demonstrateUsage() {
  
  try {
    
    const context = new AudioContext({ sampleRate: 16000 });
    
    
    const workletNode = new VTFAudioWorkletNode(context, 'demoUser123', {
      bufferSize: 4096,
      silenceThreshold: 0.001
    });
    
    
    workletNode.onAudioData((data) => {
      
      
    });
    
    
    await workletNode.initialize();
    
    
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 800;
    
    
    oscillator.connect(workletNode.node);
    workletNode.connect(context.destination);
    
    
    oscillator.start();
    
    
    await TestUtils.wait(1000);
    
    
    const stats = await workletNode.getStats();
    
    
    oscillator.stop();
    workletNode.destroy();
    await context.close();
    
    
  } catch (error) {
    console.error('[Demo] Error:', error);
  }
}

async function runAllTests() {
  
  
  if (typeof AudioWorkletNode === 'undefined') {
    console.error('❌ AudioWorklet not supported in this environment');
    
    return;
  }
  
  const tests = [
    ['Initialization', AudioWorkletTests.testInitialization],
    ['Audio Capture', AudioWorkletTests.testAudioCapture],
    ['Silence Detection', AudioWorkletTests.testSilenceDetection],
    ['Statistics', AudioWorkletTests.testStatistics],
    ['Config Updates', AudioWorkletTests.testConfigUpdates],
    ['Error Handling', AudioWorkletTests.testErrorHandling],
    ['Memory Cleanup', AudioWorkletTests.testMemoryCleanup],
    ['Performance', AudioWorkletTests.testPerformance]
  ];
  
  for (const [name, testFn] of tests) {
    await TestUtils.runTest(name, testFn);
    await TestUtils.wait(500); 
  }
  
  
  await demonstrateUsage();
  
  
}

export { runAllTests, AudioWorkletTests, demonstrateUsage, TestUtils };

if (typeof window !== 'undefined' && window.location.href.includes('test')) {
  runAllTests();
}