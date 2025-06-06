/**
 * Test suite for VTFStreamMonitor
 * Run these tests in the browser console
 */

import { VTFStreamMonitor } from './vtf-stream-monitor.js';

// Test utilities
const TestUtils = {
  // Create a mock audio element
  createMockAudioElement(id = 'test-audio') {
    const audio = document.createElement('audio');
    audio.id = id;
    document.body.appendChild(audio);
    return audio;
  },
  
  // Create a mock MediaStream
  createMockMediaStream() {
    // Try to create a real MediaStream first
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const destination = audioContext.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      
      // Stop after 100ms to avoid noise
      setTimeout(() => oscillator.stop(), 100);
      
      return destination.stream;
    } catch (e) {
      // Fallback to mock
      console.warn('Using mock MediaStream (real audio context failed)');
      return {
        active: true,
        id: 'mock-stream-' + Date.now(),
        getAudioTracks: () => [{
          readyState: 'live',
          muted: false,
          kind: 'audio',
          id: 'mock-track-' + Date.now()
        }]
      };
    }
  },
  
  // Clean up created elements
  cleanup() {
    document.querySelectorAll('audio[id^="test-"]').forEach(el => el.remove());
  },
  
  // Async test runner
  async runTest(name, testFn) {
    console.group(`🧪 Test: ${name}`);
    try {
      await testFn();
      console.log('✅ PASSED');
    } catch (error) {
      console.error('❌ FAILED:', error);
    }
    console.groupEnd();
  },
  
  // Wait helper
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// Test Suite
const VTFStreamMonitorTests = {
  // Test 1: Basic instantiation
  async testInstantiation() {
    const monitor = new VTFStreamMonitor();
    console.assert(monitor instanceof VTFStreamMonitor, 'Should create instance');
    console.assert(monitor.monitors instanceof Map, 'Should have monitors Map');
    console.assert(monitor.getMonitorCount() === 0, 'Should start with zero monitors');
    monitor.destroy();
  },
  
  // Test 2: Monitor with immediate stream
  async testImmediateStream() {
    const monitor = new VTFStreamMonitor();
    const audio = TestUtils.createMockAudioElement('test-immediate');
    const stream = TestUtils.createMockMediaStream();
    
    // Set stream before monitoring
    audio.srcObject = stream;
    
    let callbackCalled = false;
    let callbackStream = null;
    
    monitor.startMonitoring(audio, 'user1', (detectedStream) => {
      callbackCalled = true;
      callbackStream = detectedStream;
    });
    
    // Should call immediately
    await TestUtils.wait(10);
    
    console.assert(callbackCalled === true, 'Callback should be called immediately');
    console.assert(callbackStream === stream, 'Should receive correct stream');
    console.assert(monitor.getMonitorCount() === 0, 'Monitor should not be active');
    
    TestUtils.cleanup();
    monitor.destroy();
  },
  
  // Test 3: Monitor with delayed stream
  async testDelayedStream() {
    const monitor = new VTFStreamMonitor({ 
      pollInterval: 25,
      enableDebugLogs: true 
    });
    const audio = TestUtils.createMockAudioElement('test-delayed');
    
    let callbackCalled = false;
    let detectionTime = 0;
    const startTime = Date.now();
    
    // Start monitoring
    const started = monitor.startMonitoring(audio, 'user2', (stream) => {
      callbackCalled = true;
      detectionTime = Date.now() - startTime;
      console.log('Stream detected in callback after', detectionTime, 'ms');
    });
    
    console.assert(started === true, 'Should start monitoring');
    console.assert(monitor.isMonitoring('user2'), 'Should be monitoring user2');
    
    // Assign stream after 150ms
    setTimeout(() => {
      audio.srcObject = TestUtils.createMockMediaStream();
    }, 150);
    
    // Wait for detection
    await TestUtils.wait(300);
    
    console.assert(callbackCalled === true, 'Callback should be called');
    console.assert(detectionTime >= 150 && detectionTime < 250, `Detection time should be ~150ms, was ${detectionTime}`);
    console.assert(!monitor.isMonitoring('user2'), 'Should stop monitoring after detection');
    
    const debug = monitor.debug();
    console.assert(debug.stats.monitorsSucceeded === 1, 'Should have one success');
    
    TestUtils.cleanup();
    monitor.destroy();
  },
  
  // Test 4: Monitor timeout
  async testMonitorTimeout() {
    const monitor = new VTFStreamMonitor({
      pollInterval: 50,
      maxPollTime: 300  // Short timeout for testing
    });
    const audio = TestUtils.createMockAudioElement('test-timeout');
    
    let callbackCalled = false;
    let callbackStream = null;
    
    monitor.startMonitoring(audio, 'user3', (stream) => {
      callbackCalled = true;
      callbackStream = stream;
    });
    
    // Wait for timeout
    await TestUtils.wait(400);
    
    console.assert(callbackCalled === true, 'Callback should be called on timeout');
    console.assert(callbackStream === null, 'Should receive null on timeout');
    console.assert(!monitor.isMonitoring('user3'), 'Should stop monitoring after timeout');
    
    const debug = monitor.debug();
    console.assert(debug.stats.monitorsFailed === 1, 'Should have one failure');
    
    TestUtils.cleanup();
    monitor.destroy();
  },
  
  // Test 5: Stream ready validation
  async testStreamReadyValidation() {
    const monitor = new VTFStreamMonitor();
    const stream = TestUtils.createMockMediaStream();
    
    // Test valid stream
    try {
      const readyStream = await monitor.waitForStreamReady(stream);
      console.assert(readyStream === stream, 'Should return same stream when ready');
      console.assert(monitor.debug().stats.streamsValidated === 1, 'Should count validation');
    } catch (error) {
      console.error('Should not fail for valid stream:', error);
    }
    
    // Test invalid stream
    try {
      await monitor.waitForStreamReady(null);
      console.assert(false, 'Should throw for null stream');
    } catch (error) {
      console.assert(error.message.includes('Invalid stream'), 'Should have correct error');
    }
    
    monitor.destroy();
  },
  
  // Test 6: Multiple monitors
  async testMultipleMonitors() {
    const monitor = new VTFStreamMonitor({ pollInterval: 25 });
    const audio1 = TestUtils.createMockAudioElement('test-multi-1');
    const audio2 = TestUtils.createMockAudioElement('test-multi-2');
    const audio3 = TestUtils.createMockAudioElement('test-multi-3');
    
    let callbacks = { user1: false, user2: false, user3: false };
    
    // Start multiple monitors
    monitor.startMonitoring(audio1, 'user1', () => { callbacks.user1 = true; });
    monitor.startMonitoring(audio2, 'user2', () => { callbacks.user2 = true; });
    monitor.startMonitoring(audio3, 'user3', () => { callbacks.user3 = true; });
    
    console.assert(monitor.getMonitorCount() === 3, 'Should have 3 active monitors');
    
    // Assign streams at different times
    setTimeout(() => { audio1.srcObject = TestUtils.createMockMediaStream(); }, 50);
    setTimeout(() => { audio2.srcObject = TestUtils.createMockMediaStream(); }, 100);
    setTimeout(() => { audio3.srcObject = TestUtils.createMockMediaStream(); }, 150);
    
    // Wait for all
    await TestUtils.wait(250);
    
    console.assert(callbacks.user1 && callbacks.user2 && callbacks.user3, 'All callbacks should fire');
    console.assert(monitor.getMonitorCount() === 0, 'Should have no active monitors');
    
    TestUtils.cleanup();
    monitor.destroy();
  },
  
  // Test 7: Stop monitoring
  async testStopMonitoring() {
    const monitor = new VTFStreamMonitor();
    const audio = TestUtils.createMockAudioElement('test-stop');
    
    let callbackCalled = false;
    
    monitor.startMonitoring(audio, 'user4', () => {
      callbackCalled = true;
    });
    
    console.assert(monitor.isMonitoring('user4'), 'Should be monitoring');
    
    // Stop before stream assignment
    const stopped = monitor.stopMonitoring('user4');
    console.assert(stopped === true, 'Should return true when stopped');
    console.assert(!monitor.isMonitoring('user4'), 'Should not be monitoring');
    
    // Assign stream after stop
    audio.srcObject = TestUtils.createMockMediaStream();
    await TestUtils.wait(100);
    
    console.assert(callbackCalled === false, 'Callback should not fire after stop');
    
    TestUtils.cleanup();
    monitor.destroy();
  },
  
  // Test 8: Element removal during monitoring
  async testElementRemoval() {
    const monitor = new VTFStreamMonitor({ pollInterval: 25 });
    const audio = TestUtils.createMockAudioElement('test-removal');
    
    let callbackCalled = false;
    
    monitor.startMonitoring(audio, 'user5', () => {
      callbackCalled = true;
    });
    
    // Remove element after 50ms
    setTimeout(() => {
      audio.remove();
    }, 50);
    
    await TestUtils.wait(150);
    
    console.assert(!monitor.isMonitoring('user5'), 'Should stop monitoring removed element');
    console.assert(monitor.debug().stats.monitorsFailed === 1, 'Should count as failure');
    
    monitor.destroy();
  },
  
  // Test 9: Input validation
  async testInputValidation() {
    const monitor = new VTFStreamMonitor();
    
    // Invalid element
    let result = monitor.startMonitoring(null, 'user', () => {});
    console.assert(result === false, 'Should reject null element');
    
    result = monitor.startMonitoring({}, 'user', () => {});
    console.assert(result === false, 'Should reject non-audio element');
    
    // Invalid userId
    const audio = TestUtils.createMockAudioElement('test-validation');
    result = monitor.startMonitoring(audio, null, () => {});
    console.assert(result === false, 'Should reject null userId');
    
    // Invalid callback
    result = monitor.startMonitoring(audio, 'user', 'not-a-function');
    console.assert(result === false, 'Should reject non-function callback');
    
    // Duplicate monitoring
    monitor.startMonitoring(audio, 'user6', () => {});
    result = monitor.startMonitoring(audio, 'user6', () => {});
    console.assert(result === false, 'Should reject duplicate monitoring');
    
    TestUtils.cleanup();
    monitor.destroy();
  },
  
  // Test 10: Memory cleanup
  async testMemoryCleanup() {
    const monitor = new VTFStreamMonitor({ pollInterval: 10 });
    
    // Start many monitors
    for (let i = 0; i < 10; i++) {
      const audio = TestUtils.createMockAudioElement(`test-mem-${i}`);
      monitor.startMonitoring(audio, `user-mem-${i}`, () => {});
    }
    
    console.assert(monitor.getMonitorCount() === 10, 'Should have 10 monitors');
    
    // Stop all
    const stopped = monitor.stopAll();
    console.assert(stopped === 10, 'Should stop 10 monitors');
    console.assert(monitor.getMonitorCount() === 0, 'Should have no monitors');
    
    // Destroy
    monitor.destroy();
    console.assert(monitor.destroyed === true, 'Should be marked destroyed');
    
    TestUtils.cleanup();
  }
};

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting VTFStreamMonitor tests...\n');
  
  const tests = [
    ['Instantiation', VTFStreamMonitorTests.testInstantiation],
    ['Immediate Stream', VTFStreamMonitorTests.testImmediateStream],
    ['Delayed Stream', VTFStreamMonitorTests.testDelayedStream],
    ['Monitor Timeout', VTFStreamMonitorTests.testMonitorTimeout],
    ['Stream Ready Validation', VTFStreamMonitorTests.testStreamReadyValidation],
    ['Multiple Monitors', VTFStreamMonitorTests.testMultipleMonitors],
    ['Stop Monitoring', VTFStreamMonitorTests.testStopMonitoring],
    ['Element Removal', VTFStreamMonitorTests.testElementRemoval],
    ['Input Validation', VTFStreamMonitorTests.testInputValidation],
    ['Memory Cleanup', VTFStreamMonitorTests.testMemoryCleanup]
  ];
  
  for (const [name, testFn] of tests) {
    await TestUtils.runTest(name, testFn);
  }
  
  console.log('\n✨ All tests completed!');
  
  // Final cleanup
  TestUtils.cleanup();
}

// Export test functions
export { runAllTests, VTFStreamMonitorTests, TestUtils };

// Auto-run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location.href.includes('test')) {
  runAllTests();
}