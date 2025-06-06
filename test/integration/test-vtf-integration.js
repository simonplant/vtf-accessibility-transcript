

const TestEnvironment = {
  
  mockDOM: null,
  
  
  originalChrome: window.chrome,
  mockChrome: {
    runtime: {
      id: 'test-extension-id',
      getURL: (path) => `chrome-extension:
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
  
  
  messages: [],
  
  
  timers: {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window)
  },
  
  
  createMockDOM() {
    
    this.cleanupDOM();
    
    
    const container = document.createElement('div');
    container.id = 'test-vtf-container';
    container.style.display = 'none';
    
    
    const topRoomDiv = document.createElement('div');
    topRoomDiv.id = 'topRoomDiv';
    topRoomDiv.style.display = 'none';
    container.appendChild(topRoomDiv);
    
    document.body.appendChild(container);
    this.mockDOM = container;
    
    
  },
  
  
  addAudioElement(userId) {
    const topRoomDiv = document.getElementById('topRoomDiv');
    const audio = document.createElement('audio');
    audio.id = `msRemAudio-${userId}`;
    audio.autoplay = false;
    topRoomDiv.appendChild(audio);
    return audio;
  },
  
  
  createMockStream() {
    
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
        
      },
      stopListeningToPresenter: function(userData) {
        
      },
      consumers: new Map()
    };
    
    window.reconnectAudio = function() {
      
      
      const elements = document.querySelectorAll("[id^='msRemAudio-']");
      elements.forEach(el => el.remove());
    };
    
    window.adjustVol = function(event) {
      
    };
    
    
  },
  
  
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

async function testHappyPath() {
  
  
  TestEnvironment.createMockDOM();
  TestEnvironment.setupVTFGlobals();
  window.chrome = TestEnvironment.mockChrome;
  TestEnvironment.messages = [];
  
  try {
    
    
    const globalsFinder = new VTFGlobalsFinder();
    const found = await globalsFinder.waitForGlobals(5, 100);
    
    if (!found) {
      throw new Error('Globals not found');
    }
    
    
    
    
    const audioCapture = new VTFAudioCapture();
    await audioCapture.initialize();
    
    
    
    
    const streamMonitor = new VTFStreamMonitor();
    
    
    
    const userId = 'testUser123';
    const audioElement = TestEnvironment.addAudioElement(userId);
    
    
    let streamDetected = false;
    streamMonitor.startMonitoring(audioElement, userId, (stream) => {
      streamDetected = true;
      
    });
    
    
    await new Promise(resolve => setTimeout(resolve, 100));
    audioElement.srcObject = TestEnvironment.createMockStream();
    
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (!streamDetected) {
      throw new Error('Stream not detected');
    }
    
    
    
    await audioCapture.captureElement(audioElement, audioElement.srcObject, userId);
    
    if (!audioCapture.captures.has(userId)) {
      throw new Error('Capture not started');
    }
    
    
    
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    
    const audioChunks = TestEnvironment.messages.filter(m => m.type === 'audioChunk');
    if (audioChunks.length === 0) {
      throw new Error('No audio chunks sent');
    }
    
    
    
    audioCapture.stopCapture(userId);
    streamMonitor.stopMonitoring(userId);
    
    
    return true;
    
  } catch (error) {
    console.error('\n❌ Happy Path test FAILED:', error.message);
    return false;
  } finally {
    TestEnvironment.cleanup();
  }
}

async function testRecovery() {
  
  TestEnvironment.createMockDOM();
  TestEnvironment.setupVTFGlobals();
  window.chrome = TestEnvironment.mockChrome;
  
  try {
    
    const globalsFinder = new VTFGlobalsFinder();
    await globalsFinder.waitForGlobals(5, 100);
    
    const audioCapture = new VTFAudioCapture();
    await audioCapture.initialize();
    
    const stateMonitor = new VTFStateMonitor();
    stateMonitor.startSync(globalsFinder, 500);
    
    
    
    const users = ['user1', 'user2', 'user3'];
    
    for (const userId of users) {
      const element = TestEnvironment.addAudioElement(userId);
      element.srcObject = TestEnvironment.createMockStream();
      await audioCapture.captureElement(element, element.srcObject, userId);
    }
    
    if (audioCapture.captures.size !== 3) {
      throw new Error('Not all captures started');
    }
    
    
    
    
    let reconnectDetected = false;
    stateMonitor.on('onReconnect', () => {
      reconnectDetected = true;
    });
    
    
    window.reconnectAudio();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (!reconnectDetected) {
      throw new Error('Reconnect not detected');
    }
    
    
    
    const remainingElements = document.querySelectorAll("[id^='msRemAudio-']");
    if (remainingElements.length !== 0) {
      throw new Error('Elements not removed');
    }
    
    
    
    
    for (const userId of users) {
      const element = TestEnvironment.addAudioElement(userId);
      element.srcObject = TestEnvironment.createMockStream();
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    
    
    stateMonitor.destroy();
    audioCapture.destroy();
    
    
    return true;
    
  } catch (error) {
    console.error('\n❌ Recovery test FAILED:', error.message);
    return false;
  } finally {
    TestEnvironment.cleanup();
  }
}

async function testEdgeCases() {
  
  const results = {
    globalsTimeout: false,
    streamTimeout: false,
    multipleReconnects: false,
    initFailure: false
  };
  
  
  
  try {
    TestEnvironment.createMockDOM();
    window.chrome = TestEnvironment.mockChrome;
    
    
    const globalsFinder = new VTFGlobalsFinder();
    const found = await globalsFinder.waitForGlobals(2, 100); 
    
    if (found) {
      throw new Error('Should not find globals');
    }
    
    results.globalsTimeout = true;
    
  } catch (error) {
    console.error('  ✗ Globals timeout test failed:', error.message);
  } finally {
    TestEnvironment.cleanup();
  }
  
  
  
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
    
    
    await new Promise(resolve => setTimeout(resolve, 600));
    
    if (!timeoutDetected) {
      throw new Error('Timeout not detected');
    }
    
    results.streamTimeout = true;
    
  } catch (error) {
    console.error('  ✗ Stream timeout test failed:', error.message);
  } finally {
    TestEnvironment.cleanup();
  }
  
  
  
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
    
    
    for (let i = 0; i < 5; i++) {
      window.reconnectAudio();
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (reconnectCount !== 5) {
      throw new Error(`Expected 5 reconnects, got ${reconnectCount}`);
    }
    
    results.multipleReconnects = true;
    
    stateMonitor.destroy();
    
  } catch (error) {
    console.error('  ✗ Multiple reconnects test failed:', error.message);
  } finally {
    TestEnvironment.cleanup();
  }
  
  
  
  try {
    
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
        
      }
    }
    
    
    window.AudioContext = originalAudioContext;
    
  } catch (error) {
    console.error('  ✗ Initialization failure test failed:', error.message);
  }
  
  
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;
  
  
  return passed === total;
}

async function testPerformance() {
  
  TestEnvironment.createMockDOM();
  TestEnvironment.setupVTFGlobals();
  window.chrome = TestEnvironment.mockChrome;
  
  try {
    
    const audioCapture = new VTFAudioCapture();
    await audioCapture.initialize();
    
    const dataTransfer = new AudioDataTransfer();
    
    
    
    const initialMemory = performance.memory?.usedJSHeapSize || 0;
    
    
    const userCount = 20;
    for (let i = 0; i < userCount; i++) {
      const userId = `perfUser${i}`;
      const element = TestEnvironment.addAudioElement(userId);
      element.srcObject = TestEnvironment.createMockStream();
      await audioCapture.captureElement(element, element.srcObject, userId);
    }
    
    
    
    
    const startTime = Date.now();
    const chunkCount = 100;
    
    for (let i = 0; i < chunkCount; i++) {
      for (let j = 0; j < userCount; j++) {
        dataTransfer.sendAudioData(`perfUser${j}`, new Float32Array(4096));
      }
    }
    
    const duration = Date.now() - startTime;
    const throughput = (chunkCount * userCount * 4096 * 4) / (duration / 1000) / 1024 / 1024;
    
    
    
    
    audioCapture.stopAll();
    dataTransfer.destroy();
    
    
    if (window.gc) {
      window.gc();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const finalMemory = performance.memory?.usedJSHeapSize || 0;
    const memoryIncrease = finalMemory - initialMemory;
    
    if (memoryIncrease > 0) {
      
    }
    
    
    if (audioCapture.captures.size !== 0) {
      throw new Error('Captures not cleaned up');
    }
    
    if (dataTransfer.pendingChunks.size !== 0) {
      throw new Error('Pending chunks not cleaned up');
    }
    
    
    
    return true;
    
  } catch (error) {
    console.error('\n❌ Performance test FAILED:', error.message);
    return false;
  } finally {
    TestEnvironment.cleanup();
  }
}

async function runIntegrationTests() {
  
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
  
  
  results.happyPath = await testHappyPath();
  results.recovery = await testRecovery();
  results.edgeCases = await testEdgeCases();
  results.performance = await testPerformance();
  
  
  
  
  
  let totalPassed = 0;
  for (const [test, passed] of Object.entries(results)) {
    
    if (passed) totalPassed++;
  }
  
  const totalTests = Object.keys(results).length;
  
  if (totalPassed === totalTests) {
    
  } else {
    
  }
  
  
}

runIntegrationTests();