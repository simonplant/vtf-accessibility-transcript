

import { VTFStreamMonitor } from './vtf-stream-monitor.js';

const TestUtils = {
  
  createMockAudioElement(id = 'test-audio') {
    const audio = document.createElement('audio');
    audio.id = id;
    document.body.appendChild(audio);
    return audio;
  },
  
  
  createMockMediaStream() {
    
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const destination = audioContext.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      
      
      setTimeout(() => oscillator.stop(), 100);
      
      return destination.stream;
    } catch (e) {
      
      
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
  
  
  cleanup() {
    document.querySelectorAll('audio[id^="test-"]').forEach(el => el.remove());
  },
  
  
  async runTest(name, testFn) {
    console.group(`🧪 Test: ${name}`);
    try {
      await testFn();
      
    } catch (error) {
      console.error('❌ FAILED:', error);
    }
    console.groupEnd();
  },
  
  
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

const VTFStreamMonitorTests = {
  
  async testInstantiation() {
    const monitor = new VTFStreamMonitor();
    console.assert(monitor instanceof VTFStreamMonitor, 'Should create instance');
    console.assert(monitor.monitors instanceof Map, 'Should have monitors Map');
    console.assert(monitor.getMonitorCount() === 0, 'Should start with zero monitors');
    monitor.destroy();
  },
  
  
  async testImmediateStream() {
    const monitor = new VTFStreamMonitor();
    const audio = TestUtils.createMockAudioElement('test-immediate');
    const stream = TestUtils.createMockMediaStream();
    
    
    audio.srcObject = stream;
    
    let callbackCalled = false;
    let callbackStream = null;
    
    monitor.startMonitoring(audio, 'user1', (detectedStream) => {
      callbackCalled = true;
      callbackStream = detectedStream;
    });
    
    
    await TestUtils.wait(10);
    
    console.assert(callbackCalled === true, 'Callback should be called immediately');
    console.assert(callbackStream === stream, 'Should receive correct stream');
    console.assert(monitor.getMonitorCount() === 0, 'Monitor should not be active');
    
    TestUtils.cleanup();
    monitor.destroy();
  },
  
  
  async testDelayedStream() {
    const monitor = new VTFStreamMonitor({ 
      pollInterval: 25,
      enableDebugLogs: true 
    });
    const audio = TestUtils.createMockAudioElement('test-delayed');
    
    let callbackCalled = false;
    let detectionTime = 0;
    const startTime = Date.now();
    
    
    const started = monitor.startMonitoring(audio, 'user2', (stream) => {
      callbackCalled = true;
      detectionTime = Date.now() - startTime;
      
    });
    
    console.assert(started === true, 'Should start monitoring');
    console.assert(monitor.isMonitoring('user2'), 'Should be monitoring user2');
    
    
    setTimeout(() => {
      audio.srcObject = TestUtils.createMockMediaStream();
    }, 150);
    
    
    await TestUtils.wait(300);
    
    console.assert(callbackCalled === true, 'Callback should be called');
    console.assert(detectionTime >= 150 && detectionTime < 250, `Detection time should be ~150ms, was ${detectionTime}`);
    console.assert(!monitor.isMonitoring('user2'), 'Should stop monitoring after detection');
    
    const debug = monitor.debug();
    console.assert(debug.stats.monitorsSucceeded === 1, 'Should have one success');
    
    TestUtils.cleanup();
    monitor.destroy();
  },
  
  
  async testMonitorTimeout() {
    const monitor = new VTFStreamMonitor({
      pollInterval: 50,
      maxPollTime: 300  
    });
    const audio = TestUtils.createMockAudioElement('test-timeout');
    
    let callbackCalled = false;
    let callbackStream = null;
    
    monitor.startMonitoring(audio, 'user3', (stream) => {
      callbackCalled = true;
      callbackStream = stream;
    });
    
    
    await TestUtils.wait(400);
    
    console.assert(callbackCalled === true, 'Callback should be called on timeout');
    console.assert(callbackStream === null, 'Should receive null on timeout');
    console.assert(!monitor.isMonitoring('user3'), 'Should stop monitoring after timeout');
    
    const debug = monitor.debug();
    console.assert(debug.stats.monitorsFailed === 1, 'Should have one failure');
    
    TestUtils.cleanup();
    monitor.destroy();
  },
  
  
  async testStreamReadyValidation() {
    const monitor = new VTFStreamMonitor();
    const stream = TestUtils.createMockMediaStream();
    
    
    try {
      const readyStream = await monitor.waitForStreamReady(stream);
      console.assert(readyStream === stream, 'Should return same stream when ready');
      console.assert(monitor.debug().stats.streamsValidated === 1, 'Should count validation');
    } catch (error) {
      console.error('Should not fail for valid stream:', error);
    }
    
    
    try {
      await monitor.waitForStreamReady(null);
      console.assert(false, 'Should throw for null stream');
    } catch (error) {
      console.assert(error.message.includes('Invalid stream'), 'Should have correct error');
    }
    
    monitor.destroy();
  },
  
  
  async testMultipleMonitors() {
    const monitor = new VTFStreamMonitor({ pollInterval: 25 });
    const audio1 = TestUtils.createMockAudioElement('test-multi-1');
    const audio2 = TestUtils.createMockAudioElement('test-multi-2');
    const audio3 = TestUtils.createMockAudioElement('test-multi-3');
    
    let callbacks = { user1: false, user2: false, user3: false };
    
    
    monitor.startMonitoring(audio1, 'user1', () => { callbacks.user1 = true; });
    monitor.startMonitoring(audio2, 'user2', () => { callbacks.user2 = true; });
    monitor.startMonitoring(audio3, 'user3', () => { callbacks.user3 = true; });
    
    console.assert(monitor.getMonitorCount() === 3, 'Should have 3 active monitors');
    
    
    setTimeout(() => { audio1.srcObject = TestUtils.createMockMediaStream(); }, 50);
    setTimeout(() => { audio2.srcObject = TestUtils.createMockMediaStream(); }, 100);
    setTimeout(() => { audio3.srcObject = TestUtils.createMockMediaStream(); }, 150);
    
    
    await TestUtils.wait(250);
    
    console.assert(callbacks.user1 && callbacks.user2 && callbacks.user3, 'All callbacks should fire');
    console.assert(monitor.getMonitorCount() === 0, 'Should have no active monitors');
    
    TestUtils.cleanup();
    monitor.destroy();
  },
  
  
  async testStopMonitoring() {
    const monitor = new VTFStreamMonitor();
    const audio = TestUtils.createMockAudioElement('test-stop');
    
    let callbackCalled = false;
    
    monitor.startMonitoring(audio, 'user4', () => {
      callbackCalled = true;
    });
    
    console.assert(monitor.isMonitoring('user4'), 'Should be monitoring');
    
    
    const stopped = monitor.stopMonitoring('user4');
    console.assert(stopped === true, 'Should return true when stopped');
    console.assert(!monitor.isMonitoring('user4'), 'Should not be monitoring');
    
    
    audio.srcObject = TestUtils.createMockMediaStream();
    await TestUtils.wait(100);
    
    console.assert(callbackCalled === false, 'Callback should not fire after stop');
    
    TestUtils.cleanup();
    monitor.destroy();
  },
  
  
  async testElementRemoval() {
    const monitor = new VTFStreamMonitor({ pollInterval: 25 });
    const audio = TestUtils.createMockAudioElement('test-removal');
    
    let callbackCalled = false;
    
    monitor.startMonitoring(audio, 'user5', () => {
      callbackCalled = true;
    });
    
    
    setTimeout(() => {
      audio.remove();
    }, 50);
    
    await TestUtils.wait(150);
    
    console.assert(!monitor.isMonitoring('user5'), 'Should stop monitoring removed element');
    console.assert(monitor.debug().stats.monitorsFailed === 1, 'Should count as failure');
    
    monitor.destroy();
  },
  
  
  async testInputValidation() {
    const monitor = new VTFStreamMonitor();
    
    
    let result = monitor.startMonitoring(null, 'user', () => {});
    console.assert(result === false, 'Should reject null element');
    
    result = monitor.startMonitoring({}, 'user', () => {});
    console.assert(result === false, 'Should reject non-audio element');
    
    
    const audio = TestUtils.createMockAudioElement('test-validation');
    result = monitor.startMonitoring(audio, null, () => {});
    console.assert(result === false, 'Should reject null userId');
    
    
    result = monitor.startMonitoring(audio, 'user', 'not-a-function');
    console.assert(result === false, 'Should reject non-function callback');
    
    
    monitor.startMonitoring(audio, 'user6', () => {});
    result = monitor.startMonitoring(audio, 'user6', () => {});
    console.assert(result === false, 'Should reject duplicate monitoring');
    
    TestUtils.cleanup();
    monitor.destroy();
  },
  
  
  async testMemoryCleanup() {
    const monitor = new VTFStreamMonitor({ pollInterval: 10 });
    
    
    for (let i = 0; i < 10; i++) {
      const audio = TestUtils.createMockAudioElement(`test-mem-${i}`);
      monitor.startMonitoring(audio, `user-mem-${i}`, () => {});
    }
    
    console.assert(monitor.getMonitorCount() === 10, 'Should have 10 monitors');
    
    
    const stopped = monitor.stopAll();
    console.assert(stopped === 10, 'Should stop 10 monitors');
    console.assert(monitor.getMonitorCount() === 0, 'Should have no monitors');
    
    
    monitor.destroy();
    console.assert(monitor.destroyed === true, 'Should be marked destroyed');
    
    TestUtils.cleanup();
  }
};

async function runAllTests() {
  
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
  
  
  
  TestUtils.cleanup();
}

export { runAllTests, VTFStreamMonitorTests, TestUtils };

if (typeof window !== 'undefined' && window.location.href.includes('test')) {
  runAllTests();
}