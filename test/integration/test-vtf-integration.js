// test/integration/test-vtf-integration.js
/**
 * VTF Audio Extension Integration Test Suite
 * 
 * Tests the complete audio pipeline from DOM element detection to data transfer.
 * 
 * Run in Chrome DevTools:
 * 1. Open any page (preferably VTF)
 * 2. Open DevTools Console
 * 3. Copy and paste this entire file
 * 4. Tests will run automatically
 */

console.log('[Integration Test] Starting VTF Audio Extension integration tests...');

// Test environment setup
const TestEnvironment = {
  // Mock DOM container
  mockDOM: null,
  
  // Mock Chrome APIs
  originalChrome: window.chrome,
  mockChrome: {
    runtime: {
      id: 'test-extension-id',
      getURL: (path) => `chrome-extension://test-id/${path}`,
      sendMessage: function(msg, callback) {
        TestEnvironment.messages.push(msg);
        callback && callback({ received: true });
      },
      lastError: null
    },
    storage: {
      local: {
        get: (keys, callback) => {
          callback && callback({});
          return Promise.resolve({});
        }
      }
    }
  },
  
  // Track messages
  messages: [],
  
  // Timing controls
  timers: {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window)
  },
  
  // Create mock VTF DOM structure
  createMockDOM() {
    // Remove any existing mock
    this.cleanupDOM();
    
    // Create container
    const container = document.createElement('div');
    container.id = 'test-vtf-container';
    container.style.display = 'none';
    
    // Create topRoomDiv
    const topRoomDiv = document.createElement('div');
    topRoomDiv.id = 'topRoomDiv';
    topRoomDiv.style.display = 'none';
    container.appendChild(topRoomDiv);
    
    document.body.appendChild(container);
    this.mockDOM = container;
    
    console.log('[Test Environment] Mock DOM created');
  },
  
  // Add VTF audio element
  addAudioElement(userId) {
    const topRoomDiv = document.getElementById('topRoomDiv');
    const audio = document.createElement('audio');
    audio.id = `msRemAudio-${userId}`;
    audio.autoplay = false;
    topRoomDiv.appendChild(audio);
    return audio;
  },
  
  // Create mock MediaStream
  createMockStream() {
    // Simple mock that satisfies the interface
    const track = {
      id: 'mock-track-' + Math.random(),
      kind: 'audio',
      label: 'Mock Audio',
      readyState: 'live',
      muted: false,
      enabled: true,
      onended: null,
      onmute: null,
      onunmute: null
    };
    
    return {
      id: 'mock-stream-' + Math.random(),
      active: true,
      getAudioTracks: () => [track],
      getTracks: () => [track],
      addTrack: () => {},
      removeTrack: () => {}
    };
  },
  
  // Mock VTF globals
  setupVTFGlobals() {
    window.globals = {
      audioVolume: 0.8,
      sessData: {
        currentState: 'open'
      },
      preferences: {
        autoGainControl: true,
        noiseSuppression: true,
        echoCancellation: true
      },
      videoDeviceID: 'default',
      audioDeviceID: 'default',
      talkingUsers: new Map()
    };
    
    window.mediaSoupService = {
      startListeningToPresenter: function(userData) {
        console.log('[Mock MediaSoup] startListeningToPresenter:', userData);
      },
      stopListeningToPresenter: function(userData) {
        console.log('[Mock MediaSoup] stopListeningToPresenter:', userData);
      },
      consumers: new Map()
    };
    
    window.reconnectAudio = function() {
      console.log('[Mock VTF] reconnectAudio called');
      // Simulate element removal
      const elements = document.querySelectorAll("[id^='msRemAudio-']");
      elements.forEach(el => el.remove());
    };
    
    window.adjustVol = function(event) {
      console.log('[Mock VTF] adjustVol called');
    };
    
    console.log('[Test Environment] VTF globals mocked');
  },
  
  // Cleanup
  cleanupDOM() {
    const existing = document.getElementById('test-vtf-container');
    if (existing) {
      existing.remove();
    }
  },
  
  cleanup() {
    this.cleanupDOM();
    delete window.globals;
    delete window.mediaSoupService;
    delete window.reconnectAudio;
    delete window.adjustVol;
    window.chrome = this.originalChrome;
    this.messages = [];
  }
};

// Load required modules (assuming they're already loaded or paste them here)
// For a real test, you'd import: VTFGlobalsFinder, VTFStreamMonitor, VTFStateMonitor, VTFAudioCapture, AudioDataTransfer

// Test cases
async function testHappyPath() {
  console.log('\n[Test] Happy Path - Complete audio pipeline');
  
  // Setup
  TestEnvironment.createMockDOM();
  TestEnvironment.setupVTFGlobals();
  window.chrome = TestEnvironment.mockChrome;
  TestEnvironment.messages = [];
  
  try {
    // Step 1: Initialize VTFGlobalsFinder
    console.log('  1. Finding VTF globals...');
    const globalsFinder = new VTFGlobalsFinder();
    const found = await globalsFinder.waitForGlobals(5, 100);
    
    if (!found) {
      throw new Error('Globals not found');
    }
    
    console.log('  ✓ VTF globals found');
    
    // Step 2: Initialize audio capture
    console.log('  2. Initializing audio capture...');
    const audioCapture = new VTFAudioCapture();
    await audioCapture.initialize();
    
    console.log('  ✓ Audio capture initialized');
    
    // Step 3: Set up stream monitor
    console.log('  3. Setting up stream monitor...');
    const streamMonitor = new VTFStreamMonitor();
    
    // Step 4: Add audio element and assign stream
    console.log('  4. Adding VTF audio element...');
    const userId = 'testUser123';
    const audioElement = TestEnvironment.addAudioElement(userId);
    
    // Monitor for stream
    let streamDetected = false;
    streamMonitor.startMonitoring(audioElement, userId, (stream) => {
      streamDetected = true;
      console.log('  ✓ Stream detected');
    });
    
    // Simulate stream assignment
    await new Promise(resolve => setTimeout(resolve, 100));
    audioElement.srcObject = TestEnvironment.createMockStream();
    
    // Wait for detection
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (!streamDetected) {
      throw new Error('Stream not detected');
    }
    
    // Step 5: Start audio capture
    console.log('  5. Starting audio capture...');
    await audioCapture.captureElement(audioElement, audioElement.srcObject, userId);
    
    if (!audioCapture.captures.has(userId)) {
      throw new Error('Capture not started');
    }
    
    console.log('  ✓ Audio capture started');
    
    // Step 6: Verify data flow
    console.log('  6. Verifying data flow...');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Check if audio chunks were sent
    const audioChunks = TestEnvironment.messages.filter(m => m.type === 'audioChunk');
    if (audioChunks.length === 0) {
      throw new Error('No audio chunks sent');
    }
    
    console.log(`  ✓ ${audioChunks.length} audio chunks sent`);
    
    // Cleanup
    audioCapture.stopCapture(userId);
    streamMonitor.stopMonitoring(userId);
    
    console.log('\n✅ Happy Path test PASSED');
    return true;
    
  } catch (error) {
    console.error('\n❌ Happy Path test FAILED:', error.message);
    return false;
  } finally {
    TestEnvironment.cleanup();
  }
}

async function testRecovery() {
  console.log('\n[Test] Recovery - VTF reconnectAudio handling');
  
  TestEnvironment.createMockDOM();
  TestEnvironment.setupVTFGlobals();
  window.chrome = TestEnvironment.mockChrome;
  
  try {
    // Initialize modules
    const globalsFinder = new VTFGlobalsFinder();
    await globalsFinder.waitForGlobals(5, 100);
    
    const audioCapture = new VTFAudioCapture();
    await audioCapture.initialize();
    
    const stateMonitor = new VTFStateMonitor();
    stateMonitor.startSync(globalsFinder, 500);
    
    // Start captures for multiple users
    console.log('  1. Starting captures for multiple users...');
    const users = ['user1', 'user2', 'user3'];
    
    for (const userId of users) {
      const element = TestEnvironment.addAudioElement(userId);
      element.srcObject = TestEnvironment.createMockStream();
      await audioCapture.captureElement(element, element.srcObject, userId);
    }
    
    if (audioCapture.captures.size !== 3) {
      throw new Error('Not all captures started');
    }
    
    console.log('  ✓ 3 captures active');
    
    // Simulate reconnectAudio
    console.log('  2. Simulating VTF reconnect...');
    let reconnectDetected = false;
    stateMonitor.on('onReconnect', () => {
      reconnectDetected = true;
    });
    
    // Call reconnectAudio
    window.reconnectAudio();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (!reconnectDetected) {
      throw new Error('Reconnect not detected');
    }
    
    console.log('  ✓ Reconnect detected');
    
    // Verify elements removed
    const remainingElements = document.querySelectorAll("[id^='msRemAudio-']");
    if (remainingElements.length !== 0) {
      throw new Error('Elements not removed');
    }
    
    console.log('  ✓ All audio elements removed');
    
    // Re-add elements to simulate VTF recreating them
    console.log('  3. Simulating element recreation...');
    for (const userId of users) {
      const element = TestEnvironment.addAudioElement(userId);
      element.srcObject = TestEnvironment.createMockStream();
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log('  ✓ Elements recreated');
    
    // Cleanup
    stateMonitor.destroy();
    audioCapture.destroy();
    
    console.log('\n✅ Recovery test PASSED');
    return true;
    
  } catch (error) {
    console.error('\n❌ Recovery test FAILED:', error.message);
    return false;
  } finally {
    TestEnvironment.cleanup();
  }
}

async function testEdgeCases() {
  console.log('\n[Test] Edge Cases - Error conditions and limits');
  
  const results = {
    globalsTimeout: false,
    streamTimeout: false,
    multipleReconnects: false,
    initFailure: false
  };
  
  // Test 1: Globals not found timeout
  console.log('  1. Testing globals timeout...');
  try {
    TestEnvironment.createMockDOM();
    window.chrome = TestEnvironment.mockChrome;
    // Don't set up globals
    
    const globalsFinder = new VTFGlobalsFinder();
    const found = await globalsFinder.waitForGlobals(2, 100); // Short timeout
    
    if (found) {
      throw new Error('Should not find globals');
    }
    
    results.globalsTimeout = true;
    console.log('  ✓ Globals timeout handled correctly');
    
  } catch (error) {
    console.error('  ✗ Globals timeout test failed:', error.message);
  } finally {
    TestEnvironment.cleanup();
  }
  
  // Test 2: Stream never assigned
  console.log('  2. Testing stream timeout...');
  try {
    TestEnvironment.createMockDOM();
    TestEnvironment.setupVTFGlobals();
    window.chrome = TestEnvironment.mockChrome;
    
    const streamMonitor = new VTFStreamMonitor({ maxPollTime: 500 });
    const element = TestEnvironment.addAudioElement('timeoutUser');
    
    let timeoutDetected = false;
    streamMonitor.startMonitoring(element, 'timeoutUser', (stream) => {
      if (stream === null) {
        timeoutDetected = true;
      }
    });
    
    // Don't assign stream
    await new Promise(resolve => setTimeout(resolve, 600));
    
    if (!timeoutDetected) {
      throw new Error('Timeout not detected');
    }
    
    results.streamTimeout = true;
    console.log('  ✓ Stream timeout handled correctly');
    
  } catch (error) {
    console.error('  ✗ Stream timeout test failed:', error.message);
  } finally {
    TestEnvironment.cleanup();
  }
  
  // Test 3: Multiple rapid reconnects
  console.log('  3. Testing multiple rapid reconnects...');
  try {
    TestEnvironment.createMockDOM();
    TestEnvironment.setupVTFGlobals();
    window.chrome = TestEnvironment.mockChrome;
    
    const stateMonitor = new VTFStateMonitor();
    const globalsFinder = new VTFGlobalsFinder();
    await globalsFinder.waitForGlobals(5, 100);
    
    stateMonitor.startSync(globalsFinder, 100);
    
    let reconnectCount = 0;
    stateMonitor.on('onReconnect', () => {
      reconnectCount++;
    });
    
    // Rapid reconnects
    for (let i = 0; i < 5; i++) {
      window.reconnectAudio();
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (reconnectCount !== 5) {
      throw new Error(`Expected 5 reconnects, got ${reconnectCount}`);
    }
    
    results.multipleReconnects = true;
    console.log('  ✓ Multiple reconnects handled correctly');
    
    stateMonitor.destroy();
    
  } catch (error) {
    console.error('  ✗ Multiple reconnects test failed:', error.message);
  } finally {
    TestEnvironment.cleanup();
  }
  
  // Test 4: Module initialization failures
  console.log('  4. Testing initialization failures...');
  try {
    // Override AudioContext to fail
    const originalAudioContext = window.AudioContext;
    window.AudioContext = function() {
      throw new Error('AudioContext failed');
    };
    
    const audioCapture = new VTFAudioCapture();
    
    try {
      await audioCapture.initialize();
      throw new Error('Should have failed initialization');
    } catch (initError) {
      if (initError.message.includes('AudioContext failed')) {
        results.initFailure = true;
        console.log('  ✓ Initialization failure handled correctly');
      }
    }
    
    // Restore
    window.AudioContext = originalAudioContext;
    
  } catch (error) {
    console.error('  ✗ Initialization failure test failed:', error.message);
  }
  
  // Summary
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;
  
  console.log(`\n${passed === total ? '✅' : '⚠️'} Edge Cases: ${passed}/${total} passed`);
  
  return passed === total;
}

async function testPerformance() {
  console.log('\n[Test] Performance - Memory and resource usage');
  
  TestEnvironment.createMockDOM();
  TestEnvironment.setupVTFGlobals();
  window.chrome = TestEnvironment.mockChrome;
  
  try {
    // Initialize modules
    const audioCapture = new VTFAudioCapture();
    await audioCapture.initialize();
    
    const dataTransfer = new AudioDataTransfer();
    
    console.log('  1. Testing memory with many users...');
    
    // Track initial memory (if available)
    const initialMemory = performance.memory?.usedJSHeapSize || 0;
    
    // Add many captures
    const userCount = 20;
    for (let i = 0; i < userCount; i++) {
      const userId = `perfUser${i}`;
      const element = TestEnvironment.addAudioElement(userId);
      element.srcObject = TestEnvironment.createMockStream();
      await audioCapture.captureElement(element, element.srcObject, userId);
    }
    
    console.log(`  ✓ ${userCount} captures created`);
    
    // Simulate audio data flow
    console.log('  2. Testing data throughput...');
    const startTime = Date.now();
    const chunkCount = 100;
    
    for (let i = 0; i < chunkCount; i++) {
      for (let j = 0; j < userCount; j++) {
        dataTransfer.sendAudioData(`perfUser${j}`, new Float32Array(4096));
      }
    }
    
    const duration = Date.now() - startTime;
    const throughput = (chunkCount * userCount * 4096 * 4) / (duration / 1000) / 1024 / 1024;
    
    console.log(`  ✓ Throughput: ${throughput.toFixed(2)} MB/s`);
    
    // Test cleanup
    console.log('  3. Testing cleanup...');
    audioCapture.stopAll();
    dataTransfer.destroy();
    
    // Force garbage collection if available
    if (window.gc) {
      window.gc();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const finalMemory = performance.memory?.usedJSHeapSize || 0;
    const memoryIncrease = finalMemory - initialMemory;
    
    if (memoryIncrease > 0) {
      console.log(`  ✓ Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
    }
    
    // Check for leaks
    if (audioCapture.captures.size !== 0) {
      throw new Error('Captures not cleaned up');
    }
    
    if (dataTransfer.pendingChunks.size !== 0) {
      throw new Error('Pending chunks not cleaned up');
    }
    
    console.log('  ✓ No memory leaks detected');
    
    console.log('\n✅ Performance test PASSED');
    return true;
    
  } catch (error) {
    console.error('\n❌ Performance test FAILED:', error.message);
    return false;
  } finally {
    TestEnvironment.cleanup();
  }
}

// Run all tests
async function runIntegrationTests() {
  console.log('\n[Integration Test Suite] Starting...\n');
  console.log('Environment:', {
    url: window.location.href,
    userAgent: navigator.userAgent.substring(0, 50) + '...'
  });
  
  const results = {
    happyPath: false,
    recovery: false,
    edgeCases: false,
    performance: false
  };
  
  // Run tests
  results.happyPath = await testHappyPath();
  results.recovery = await testRecovery();
  results.edgeCases = await testEdgeCases();
  results.performance = await testPerformance();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('INTEGRATION TEST RESULTS');
  console.log('='.repeat(60));
  
  let totalPassed = 0;
  for (const [test, passed] of Object.entries(results)) {
    console.log(`${passed ? '✅' : '❌'} ${test}`);
    if (passed) totalPassed++;
  }
  
  const totalTests = Object.keys(results).length;
  console.log(`\nOverall: ${totalPassed}/${totalTests} test suites passed`);
  
  if (totalPassed === totalTests) {
    console.log('\n🎉 All integration tests PASSED!');
  } else {
    console.log('\n⚠️  Some tests failed. Review the output above.');
  }
  
  console.log('\n[Integration Test Suite] Complete\n');
}

// Auto-run tests
runIntegrationTests();