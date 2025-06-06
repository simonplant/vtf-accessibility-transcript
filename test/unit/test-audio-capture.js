

import { VTFAudioCapture } from '../../src/modules/vtf-audio-capture.js';

const TestUtils = {
  
  createMockAudioElement(id = 'test-audio') {
    const audio = document.createElement('audio');
    audio.id = id;
    document.body.appendChild(audio);
    return audio;
  },
  
  
  createMockMediaStream(withAudio = true) {
    try {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const destination = audioContext.createMediaStreamDestination();
      
      oscillator.connect(destination);
      oscillator.start();
      
      return destination.stream;
    } catch (e) {
      
      const track = {
        kind: 'audio',
        id: 'mock-track-' + Date.now(),
        label: 'Mock Audio Track',
        readyState: 'live',
        muted: false,
        onended: null,
        onmute: null,
        onunmute: null,
        stop: () => { track.readyState = 'ended'; }
      };
      
      return {
        id: 'mock-stream-' + Date.now(),
        active: true,
        getAudioTracks: () => withAudio ? [track] : [],
        getTracks: () => withAudio ? [track] : []
      };
    }
  },
  
  
  setupVTFEnvironment(volume = 0.8) {
    window.appService = {
      globals: {
        audioVolume: volume
      }
    };
  },
  
  
  cleanup() {
    document.querySelectorAll('audio[id^="test-"]').forEach(el => el.remove());
    delete window.appService;
    delete window.globals;
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

const VTFAudioCaptureTests = {
  
  async testInitialization() {
    const capture = new VTFAudioCapture();
    
    console.assert(!capture.isInitialized, 'Should not be initialized');
    console.assert(capture.captures.size === 0, 'Should have no captures');
    
    await capture.initialize();
    
    console.assert(capture.isInitialized, 'Should be initialized');
    console.assert(capture.audioContext !== null, 'Should have audio context');
    console.assert(capture.audioContext.state === 'running', 'Context should be running');
    console.assert(capture.audioContext.sampleRate === 16000, 'Should use 16kHz sample rate');
    
    capture.destroy();
  },
  
  
  async testCaptureLifecycle() {
    TestUtils.setupVTFEnvironment(0.75);
    
    const capture = new VTFAudioCapture();
    await capture.initialize();
    
    const element = TestUtils.createMockAudioElement('test-element');
    const stream = TestUtils.createMockMediaStream();
    const userId = 'testUser123';
    
    
    await capture.captureElement(element, stream, userId);
    
    console.assert(capture.captures.has(userId), 'Should have capture');
    console.assert(capture.getCaptureCount() === 1, 'Should have 1 capture');
    
    const stats = capture.getCaptureStats(userId);
    console.assert(stats !== null, 'Should have stats');
    console.assert(stats.userId === userId, 'Should have correct userId');
    console.assert(stats.processorType === 'worklet' || stats.processorType === 'script', 'Should have processor type');
    
    
    await TestUtils.wait(500);
    
    
    const stopped = capture.stopCapture(userId);
    console.assert(stopped === true, 'Should stop successfully');
    console.assert(capture.captures.has(userId) === false, 'Should remove capture');
    console.assert(capture.getCaptureCount() === 0, 'Should have no captures');
    
    TestUtils.cleanup();
    capture.destroy();
  },
  
  
  async testMultipleCaptures() {
    const capture = new VTFAudioCapture();
    await capture.initialize();
    
    const users = ['user1', 'user2', 'user3'];
    
    
    for (const userId of users) {
      const element = TestUtils.createMockAudioElement(`test-${userId}`);
      const stream = TestUtils.createMockMediaStream();
      await capture.captureElement(element, stream, userId);
    }
    
    console.assert(capture.getCaptureCount() === 3, 'Should have 3 captures');
    
    
    for (const userId of users) {
      const stats = capture.getCaptureStats(userId);
      console.assert(stats !== null, `Should have stats for ${userId}`);
    }
    
    
    const stopped = capture.stopAll();
    console.assert(stopped === 3, 'Should stop 3 captures');
    console.assert(capture.getCaptureCount() === 0, 'Should have no captures');
    
    TestUtils.cleanup();
    capture.destroy();
  },
  
  
  async testVolumeIntegration() {
    TestUtils.setupVTFEnvironment(0.5);
    
    const capture = new VTFAudioCapture();
    await capture.initialize();
    
    
    const initialVolume = capture.getVTFVolume();
    console.assert(initialVolume === 0.5, 'Should get VTF volume');
    
    const element = TestUtils.createMockAudioElement('test-volume');
    const stream = TestUtils.createMockMediaStream();
    await capture.captureElement(element, stream, 'volumeTest');
    
    
    window.appService.globals.audioVolume = 0.25;
    capture.updateVolume(0.25);
    
    
    await TestUtils.wait(1500);
    
    const currentVolume = capture.getVTFVolume();
    console.assert(currentVolume === 0.25, 'Should have updated volume');
    
    TestUtils.cleanup();
    capture.destroy();
  },
  
  
  async testErrorHandling() {
    const capture = new VTFAudioCapture();
    await capture.initialize();
    
    
    try {
      await capture.captureElement(null, TestUtils.createMockMediaStream(), 'test');
      console.assert(false, 'Should throw for invalid element');
    } catch (error) {
      console.assert(error.message.includes('Invalid audio element'), 'Should have correct error');
    }
    
    
    const element = TestUtils.createMockAudioElement('test-error');
    try {
      await capture.captureElement(element, null, 'test');
      console.assert(false, 'Should throw for invalid stream');
    } catch (error) {
      console.assert(error.message.includes('Invalid MediaStream'), 'Should have correct error');
    }
    
    
    const stream = TestUtils.createMockMediaStream();
    await capture.captureElement(element, stream, 'duplicate');
    
    
    await capture.captureElement(element, stream, 'duplicate');
    console.assert(capture.getCaptureCount() === 1, 'Should not duplicate capture');
    
    TestUtils.cleanup();
    capture.destroy();
  },
  
  
  async testTrackMonitoring() {
    const capture = new VTFAudioCapture();
    await capture.initialize();
    
    const element = TestUtils.createMockAudioElement('test-track');
    const stream = TestUtils.createMockMediaStream();
    const userId = 'trackTest';
    
    await capture.captureElement(element, stream, userId);
    
    
    const captureInfo = capture.captures.get(userId);
    const track = captureInfo.track;
    
    
    if (track.stop) {
      track.stop();
      if (track.onended) track.onended();
    }
    
    await TestUtils.wait(100);
    
    
    console.assert(!capture.captures.has(userId), 'Should remove capture on track end');
    
    TestUtils.cleanup();
    capture.destroy();
  },
  
  
  async testScriptProcessorFallback() {
    
    const capture = new VTFAudioCapture();
    capture.workletReady = false; 
    
    await capture.initialize();
    
    const element = TestUtils.createMockAudioElement('test-fallback');
    const stream = TestUtils.createMockMediaStream();
    
    await capture.captureElement(element, stream, 'fallbackTest');
    
    const stats = capture.getCaptureStats('fallbackTest');
    console.assert(stats.processorType === 'script', 'Should use script processor');
    
    await TestUtils.wait(500);
    
    TestUtils.cleanup();
    capture.destroy();
  },
  
  
  async testStatistics() {
    const capture = new VTFAudioCapture();
    await capture.initialize();
    
    
    for (let i = 0; i < 3; i++) {
      const element = TestUtils.createMockAudioElement(`test-stats-${i}`);
      const stream = TestUtils.createMockMediaStream();
      await capture.captureElement(element, stream, `user${i}`);
    }
    
    await TestUtils.wait(300);
    
    
    const stats = capture.getAllStats();
    
    console.assert(stats.capturesStarted === 3, 'Should track captures started');
    console.assert(stats.activeCaptures === 3, 'Should have active captures');
    console.assert(stats.contextState === 'running', 'Should have running context');
    console.assert(Array.isArray(stats.captures), 'Should have capture array');
    
    
    const debug = capture.debug();
    
    console.assert(debug.isInitialized === true, 'Should show initialized');
    console.assert(Object.keys(debug.captures).length === 3, 'Should have capture details');
    
    TestUtils.cleanup();
    capture.destroy();
  },
  
  
  async testCaptureLimit() {
    const capture = new VTFAudioCapture({ maxCaptures: 2 });
    await capture.initialize();
    
    
    for (let i = 0; i < 2; i++) {
      const element = TestUtils.createMockAudioElement(`test-limit-${i}`);
      const stream = TestUtils.createMockMediaStream();
      await capture.captureElement(element, stream, `limit${i}`);
    }
    
    
    try {
      const element = TestUtils.createMockAudioElement('test-exceed');
      const stream = TestUtils.createMockMediaStream();
      await capture.captureElement(element, stream, 'exceed');
      console.assert(false, 'Should throw when exceeding limit');
    } catch (error) {
      console.assert(error.message.includes('Maximum captures'), 'Should have limit error');
    }
    
    TestUtils.cleanup();
    capture.destroy();
  },
  
  
  async testMemoryCleanup() {
    const capture = new VTFAudioCapture();
    await capture.initialize();
    
    
    for (let i = 0; i < 10; i++) {
      const element = TestUtils.createMockAudioElement(`test-mem-${i}`);
      const stream = TestUtils.createMockMediaStream();
      await capture.captureElement(element, stream, `mem${i}`);
    }
    
    console.assert(capture.getCaptureCount() === 10, 'Should have 10 captures');
    
    
    for (let i = 0; i < 5; i++) {
      capture.stopCapture(`mem${i}`);
    }
    
    console.assert(capture.getCaptureCount() === 5, 'Should have 5 captures');
    
    
    capture.destroy();
    
    console.assert(capture.isInitialized === false, 'Should not be initialized');
    console.assert(capture.audioContext === null, 'Should clear context');
    console.assert(capture.captures.size === 0, 'Should clear all captures');
    
    TestUtils.cleanup();
  }
};

async function runAllTests() {
  
  const tests = [
    ['Initialization', VTFAudioCaptureTests.testInitialization],
    ['Capture Lifecycle', VTFAudioCaptureTests.testCaptureLifecycle],
    ['Multiple Captures', VTFAudioCaptureTests.testMultipleCaptures],
    ['Volume Integration', VTFAudioCaptureTests.testVolumeIntegration],
    ['Error Handling', VTFAudioCaptureTests.testErrorHandling],
    ['Track Monitoring', VTFAudioCaptureTests.testTrackMonitoring],
    ['ScriptProcessor Fallback', VTFAudioCaptureTests.testScriptProcessorFallback],
    ['Statistics', VTFAudioCaptureTests.testStatistics],
    ['Capture Limit', VTFAudioCaptureTests.testCaptureLimit],
    ['Memory Cleanup', VTFAudioCaptureTests.testMemoryCleanup]
  ];
  
  for (const [name, testFn] of tests) {
    await TestUtils.runTest(name, testFn);
    await TestUtils.wait(500);
  }
  
  
}

export { runAllTests, VTFAudioCaptureTests, TestUtils };

if (typeof window !== 'undefined' && window.location.href.includes('test')) {
  runAllTests();
}