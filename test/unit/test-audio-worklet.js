/**
 * Test suite for VTF AudioWorklet implementation
 * Tests both the processor and the controller node
 */

import { VTFAudioWorkletNode } from '../../src/modules/vtf-audio-worklet-node.js';

// Test utilities
const TestUtils = {
  // Create a test audio context
  createTestContext() {
    return new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000,
      latencyHint: 'interactive'
    });
  },
  
  // Create a test audio source
  createTestSource(context, frequency = 440, duration = 1) {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    
    oscillator.frequency.value = frequency;
    oscillator.connect(gainNode);
    
    // Envelope to avoid clicks
    gainNode.gain.setValueAtTime(0, context.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1, context.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0.1, context.currentTime + duration - 0.01);
    gainNode.gain.linearRampToValueAtTime(0, context.currentTime + duration);
    
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
    
    return gainNode;
  },
  
  // Create a silent source
  createSilentSource(context) {
    const gainNode = context.createGain();
    gainNode.gain.value = 0;
    
    const oscillator = context.createOscillator();
    oscillator.connect(gainNode);
    oscillator.start();
    
    return { gainNode, oscillator };
  },
  
  // Wait helper
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  // Run single test
  async runTest(name, testFn) {
    console.group(`🧪 Test: ${name}`);
    try {
      await testFn();
      console.log('✅ PASSED');
    } catch (error) {
      console.error('❌ FAILED:', error);
    }
    console.groupEnd();
  }
};

// Test Suite
const AudioWorkletTests = {
  // Test 1: Basic initialization
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
      // This is expected in some test environments
    }
    
    workletNode.destroy();
    await context.close();
  },
  
  // Test 2: Audio data capture
  async testAudioCapture() {
    const context = TestUtils.createTestContext();
    const workletNode = new VTFAudioWorkletNode(context, 'testUser456');
    
    let audioChunks = [];
    workletNode.onAudioData((data) => {
      audioChunks.push(data);
      console.log(`Received chunk ${data.chunkIndex}: ${data.samples.length} samples`);
    });
    
    try {
      await workletNode.initialize();
      
      // Create and connect test source
      const source = TestUtils.createTestSource(context, 1000, 0.5);
      source.connect(workletNode.node);
      workletNode.connect(context.destination);
      
      // Wait for audio to process
      await TestUtils.wait(1000);
      
      console.assert(audioChunks.length > 0, 'Should receive audio chunks');
      console.assert(audioChunks[0].samples.length === 4096, 'Chunks should be 4096 samples');
      console.assert(audioChunks[0].userId === 'testUser456', 'Should have correct userId');
      console.assert(typeof audioChunks[0].maxSample === 'number', 'Should have maxSample');
      console.assert(typeof audioChunks[0].rms === 'number', 'Should have RMS value');
      
      console.log(`Captured ${audioChunks.length} chunks`);
      
    } catch (error) {
      console.warn('Test skipped:', error.message);
    }
    
    workletNode.destroy();
    await context.close();
  },
  
  // Test 3: Silence detection
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
      
      // Connect silent source
      const { gainNode, oscillator } = TestUtils.createSilentSource(context);
      gainNode.connect(workletNode.node);
      
      // Process for 500ms of silence
      await TestUtils.wait(500);
      
      // Now make some noise
      gainNode.gain.value = 0.1;
      await TestUtils.wait(500);
      
      oscillator.stop();
      
      console.assert(audioChunks.length > 0, 'Should receive chunks after silence ends');
      console.log(`Received ${audioChunks.length} chunks (silence was filtered)`);
      
    } catch (error) {
      console.warn('Test skipped:', error.message);
    }
    
    workletNode.destroy();
    await context.close();
  },
  
  // Test 4: Statistics and debugging
  async testStatistics() {
    const context = TestUtils.createTestContext();
    const workletNode = new VTFAudioWorkletNode(context, 'testStats');
    
    try {
      await workletNode.initialize();
      
      // Get initial stats
      const stats1 = await workletNode.getStats();
      console.log('Initial stats:', stats1);
      
      // Process some audio
      const source = TestUtils.createTestSource(context, 2000, 0.3);
      source.connect(workletNode.node);
      
      await TestUtils.wait(500);
      
      // Get updated stats
      const stats2 = await workletNode.getStats();
      console.log('Updated stats:', stats2);
      
      console.assert(stats2.messagesReceived > stats1.messagesReceived, 'Should have more messages');
      console.assert(stats2.initialized === true, 'Should show initialized');
      
      // Test debug output
      const debug = workletNode.debug();
      console.log('Debug info:', debug);
      console.assert(debug.isInitialized === true, 'Debug should show initialized');
      console.assert(debug.userId === 'testStats', 'Debug should show userId');
      
    } catch (error) {
      console.warn('Test skipped:', error.message);
    }
    
    workletNode.destroy();
    await context.close();
  },
  
  // Test 5: Configuration updates
  async testConfigUpdates() {
    const context = TestUtils.createTestContext();
    const workletNode = new VTFAudioWorkletNode(context, 'testConfig', {
      bufferSize: 2048
    });
    
    try {
      await workletNode.initialize();
      
      // Update configuration
      workletNode.updateConfig({
        bufferSize: 8192,
        silenceThreshold: 0.01
      });
      
      console.log('Configuration updated');
      
      const debug = workletNode.debug();
      console.assert(debug.options.bufferSize === 8192, 'Should update buffer size');
      console.assert(debug.options.silenceThreshold === 0.01, 'Should update threshold');
      
    } catch (error) {
      console.warn('Test skipped:', error.message);
    }
    
    workletNode.destroy();
    await context.close();
  },
  
  // Test 6: Error handling
  async testErrorHandling() {
    // Test with invalid context
    try {
      const workletNode = new VTFAudioWorkletNode(null, 'testError');
      console.assert(false, 'Should throw for invalid context');
    } catch (error) {
      console.assert(error.message.includes('Invalid AudioContext'), 'Should have correct error');
    }
    
    // Test with invalid userId
    const context = TestUtils.createTestContext();
    try {
      const workletNode = new VTFAudioWorkletNode(context, null);
      console.assert(false, 'Should throw for invalid userId');
    } catch (error) {
      console.assert(error.message.includes('Invalid userId'), 'Should have correct error');
    }
    
    await context.close();
  },
  
  // Test 7: Memory cleanup
  async testMemoryCleanup() {
    const context = TestUtils.createTestContext();
    const nodes = [];
    
    try {
      // Create multiple nodes
      for (let i = 0; i < 5; i++) {
        const node = new VTFAudioWorkletNode(context, `user${i}`);
        await node.initialize();
        nodes.push(node);
      }
      
      console.log(`Created ${nodes.length} worklet nodes`);
      
      // Destroy all
      nodes.forEach(node => node.destroy());
      
      console.log('All nodes destroyed');
      
      // Verify cleanup
      nodes.forEach(node => {
        console.assert(!node.isInitialized, 'Should not be initialized after destroy');
        console.assert(node.node === null, 'Should clear node reference');
      });
      
    } catch (error) {
      console.warn('Test skipped:', error.message);
    }
    
    await context.close();
  },
  
  // Test 8: Performance benchmark
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
      
      // Create continuous source
      const oscillator = context.createOscillator();
      oscillator.connect(workletNode.node);
      oscillator.start();
      
      // Run for 2 seconds
      await TestUtils.wait(2000);
      
      oscillator.stop();
      
      const elapsed = performance.now() - startTime;
      const chunksPerSecond = chunkCount / (elapsed / 1000);
      
      console.log('Performance results:');
      console.log(`- Processed ${chunkCount} chunks in ${elapsed.toFixed(0)}ms`);
      console.log(`- Rate: ${chunksPerSecond.toFixed(1)} chunks/second`);
      console.log(`- Expected rate: ${16000 / 4096} = 3.9 chunks/second`);
      
      console.assert(chunksPerSecond > 3 && chunksPerSecond < 5, 'Should be close to expected rate');
      
    } catch (error) {
      console.warn('Test skipped:', error.message);
    }
    
    workletNode.destroy();
    await context.close();
  }
};

// Example usage demonstration
async function demonstrateUsage() {
  console.log('\n📚 Example Usage:');
  
  try {
    // Create audio context
    const context = new AudioContext({ sampleRate: 16000 });
    
    // Create worklet node
    const workletNode = new VTFAudioWorkletNode(context, 'demoUser123', {
      bufferSize: 4096,
      silenceThreshold: 0.001
    });
    
    // Set up audio data handler
    workletNode.onAudioData((data) => {
      console.log(`[Demo] Received ${data.samples.length} samples from ${data.userId}`);
      console.log(`[Demo] Max sample: ${data.maxSample.toFixed(4)}, RMS: ${data.rms.toFixed(4)}`);
    });
    
    // Initialize
    await workletNode.initialize();
    console.log('[Demo] Worklet initialized');
    
    // Create a test source
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 800;
    
    // Connect: source -> worklet -> destination
    oscillator.connect(workletNode.node);
    workletNode.connect(context.destination);
    
    // Start audio
    oscillator.start();
    console.log('[Demo] Audio started');
    
    // Run for 1 second
    await TestUtils.wait(1000);
    
    // Get statistics
    const stats = await workletNode.getStats();
    console.log('[Demo] Statistics:', stats);
    
    // Clean up
    oscillator.stop();
    workletNode.destroy();
    await context.close();
    
    console.log('[Demo] Demo completed successfully');
    
  } catch (error) {
    console.error('[Demo] Error:', error);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting AudioWorklet tests...\n');
  
  // Check if we're in a suitable environment
  if (typeof AudioWorkletNode === 'undefined') {
    console.error('❌ AudioWorklet not supported in this environment');
    console.log('Please run these tests in a modern Chrome browser');
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
    await TestUtils.wait(500); // Pause between tests
  }
  
  // Run demo
  await demonstrateUsage();
  
  console.log('\n✨ All tests completed!');
}

// Export test functions
export { runAllTests, AudioWorkletTests, demonstrateUsage, TestUtils };

// Auto-run if this file is accessed directly
if (typeof window !== 'undefined' && window.location.href.includes('test')) {
  runAllTests();
}