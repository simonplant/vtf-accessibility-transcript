

const mockChrome = {
  runtime: {
    getURL: (path) => `chrome-extension:
  }
};

class MockAudioWorkletNode {
  constructor(context, name, options) {
    this.context = context;
    this.name = name;
    this.options = options;
    this.port = {
      onmessage: null,
      postMessage: (msg) => {
        
        if (msg.command === 'getStats') {
          setTimeout(() => {
            if (this.port.onmessage) {
              this.port.onmessage({ 
                data: { 
                  type: 'stats',
                  samplesProcessed: 16384,
                  chunksSkipped: 5,
                  chunksSent: 10
                }
              });
            }
          }, 10);
        }
      }
    };
    
    
    setTimeout(() => {
      if (this.port.onmessage) {
        this.port.onmessage({ 
          data: { 
            type: 'initialized',
            userId: options.processorOptions.userId 
          }
        });
      }
    }, 10);
  }
  
  connect(destination) {}
  disconnect() {}
}

class MockAudioContext {
  constructor(options) {
    this.sampleRate = options?.sampleRate || 48000;
    this.state = 'running';
    this.currentTime = 0;
    this.baseLatency = 0.01;
    
    
    this.audioWorklet = {
      addModule: async (url) => {
        
        
        return Promise.resolve();
      }
    };
    
    
    this.createdNodes = [];
  }
  
  createMediaStreamSource(stream) {
    const source = {
      connect: () => {},
      disconnect: () => {},
      stream: stream
    };
    this.createdNodes.push(source);
    return source;
  }
  
  createGain() {
    const gain = {
      gain: { value: 1.0 },
      connect: () => {},
      disconnect: () => {}
    };
    this.createdNodes.push(gain);
    return gain;
  }
  
  createScriptProcessor(bufferSize, inputs, outputs) {
    const processor = {
      bufferSize,
      onaudioprocess: null,
      connect: () => {},
      disconnect: () => {}
    };
    this.createdNodes.push(processor);
    
    
    if (bufferSize > 0) {
      setTimeout(() => {
        if (processor.onaudioprocess) {
          const event = {
            inputBuffer: {
              getChannelData: () => new Float32Array(bufferSize).fill(0.1)
            },
            playbackTime: this.currentTime
          };
          processor.onaudioprocess(event);
        }
      }, 100);
    }
    
    return processor;
  }
  
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

class MockMediaStream {
  constructor() {
    this.id = 'mock-stream-' + Math.random();
    this.active = true;
    this.tracks = [new MockMediaStreamTrack()];
  }
  
  getAudioTracks() {
    return this.tracks;
  }
}

class MockMediaStreamTrack {
  constructor() {
    this.id = 'mock-track-' + Math.random();
    this.kind = 'audio';
    this.label = 'Mock Audio Track';
    this.readyState = 'live';
    this.muted = false;
    this.enabled = true;
    this.onended = null;
    this.onmute = null;
    this.onunmute = null;
  }
}

const originalChrome = window.chrome;
const originalAudioContext = window.AudioContext;
const originalAudioWorkletNode = window.AudioWorkletNode;

async function runTests() {
  
  let passed = 0;
  let failed = 0;

  
  async function test(name, fn) {
    try {
      
      await fn();
      
      passed++;
    } catch (error) {
      console.error(`❌ ${name} - FAILED:`, error.message);
      console.error(error.stack);
      failed++;
    }
  }

  
  window.chrome = mockChrome;
  window.AudioContext = MockAudioContext;
  window.AudioWorkletNode = MockAudioWorkletNode;

  
  window.VTFAudioWorkletNode = class {
    constructor(context, userId, options) {
      this.context = context;
      this.userId = userId;
      this.options = options;
      this.node = new MockAudioWorkletNode(context, 'vtf-audio-processor', {
        processorOptions: { userId, ...options }
      });
      this.audioDataCallback = null;
    }
    
    async initialize() {
      this.isInitialized = true;
      return Promise.resolve();
    }
    
    onAudioData(callback) {
      this.audioDataCallback = callback;
      
      setTimeout(() => {
        if (callback) {
          callback({
            userId: this.userId,
            samples: new Float32Array(4096).fill(0.1),
            timestamp: Date.now()
          });
        }
      }, 100);
    }
    
    connect(dest) { return this.node.connect(dest); }
    disconnect() { return this.node.disconnect(); }
    destroy() { this.isInitialized = false; }
  };

  
  await test('AudioContext initialization', async () => {
    const capture = new VTFAudioCapture();
    
    if (capture.isInitialized) {
      throw new Error('Should not be initialized before init()');
    }
    
    await capture.initialize();
    
    if (!capture.isInitialized) {
      throw new Error('Should be initialized after init()');
    }
    
    if (!capture.audioContext) {
      throw new Error('AudioContext not created');
    }
    
    if (capture.audioContext.sampleRate !== 16000) {
      throw new Error(`Expected 16kHz sample rate, got ${capture.audioContext.sampleRate}`);
    }
  });

  
  await test('AudioWorklet loading and fallback', async () => {
    
    const capture1 = new VTFAudioCapture();
    await capture1.initialize();
    
    if (!capture1.workletReady) {
      throw new Error('Worklet should be ready');
    }
    
    
    const capture2 = new VTFAudioCapture();
    capture2.audioContext = new MockAudioContext();
    capture2.audioContext.audioWorklet = null; 
    
    await capture2.loadAudioWorklet();
    
    if (capture2.workletReady) {
      throw new Error('Worklet should not be ready when unsupported');
    }
  });

  
  await test('Stream capture from elements', async () => {
    const capture = new VTFAudioCapture();
    await capture.initialize();
    
    
    const element = document.createElement('audio');
    element.id = 'msRemAudio-testUser';
    const stream = new MockMediaStream();
    
    
    await capture.captureElement(element, stream, 'testUser');
    
    if (capture.captures.size !== 1) {
      throw new Error('Capture not tracked');
    }
    
    const captureInfo = capture.captures.get('testUser');
    if (!captureInfo) {
      throw new Error('Capture info not stored');
    }
    
    if (captureInfo.element !== element) {
      throw new Error('Element not stored correctly');
    }
    
    if (captureInfo.stream !== stream) {
      throw new Error('Stream not stored correctly');
    }
    
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    if (capture.stats.capturesStarted !== 1) {
      throw new Error('Capture start not counted');
    }
  });

  
  await test('Volume synchronization', async () => {
    const capture = new VTFAudioCapture();
    await capture.initialize();
    
    
    window.globals = { audioVolume: 0.5 };
    
    const element = document.createElement('audio');
    const stream = new MockMediaStream();
    
    await capture.captureElement(element, stream, 'volumeUser');
    
    const captureInfo = capture.captures.get('volumeUser');
    if (captureInfo.gainNode.gain.value !== 0.5) {
      throw new Error(`Expected volume 0.5, got ${captureInfo.gainNode.gain.value}`);
    }
    
    
    capture.updateVolume(0.75);
    
    if (captureInfo.gainNode.gain.value !== 0.75) {
      throw new Error('Volume not updated');
    }
    
    
    delete window.globals;
  });

  
  await test('Multiple user handling', async () => {
    const capture = new VTFAudioCapture();
    await capture.initialize();
    
    
    const users = ['user1', 'user2', 'user3'];
    
    for (const userId of users) {
      const element = document.createElement('audio');
      element.id = `msRemAudio-${userId}`;
      const stream = new MockMediaStream();
      
      await capture.captureElement(element, stream, userId);
    }
    
    if (capture.captures.size !== 3) {
      throw new Error(`Expected 3 captures, got ${capture.captures.size}`);
    }
    
    
    capture.stopCapture('user2');
    
    if (capture.captures.size !== 2) {
      throw new Error('User not removed after stop');
    }
    
    if (capture.captures.has('user2')) {
      throw new Error('Wrong user removed');
    }
    
    
    const stopped = capture.stopAll();
    
    if (stopped !== 2) {
      throw new Error(`Expected 2 stopped, got ${stopped}`);
    }
    
    if (capture.captures.size !== 0) {
      throw new Error('Not all captures stopped');
    }
  });

  
  await test('Error handling - invalid inputs', async () => {
    const capture = new VTFAudioCapture();
    await capture.initialize();
    
    
    try {
      await capture.captureElement(null, new MockMediaStream(), 'user1');
      throw new Error('Should reject null element');
    } catch (e) {
      if (!e.message.includes('Invalid audio element')) {
        throw e;
      }
    }
    
    
    try {
      const element = document.createElement('audio');
      await capture.captureElement(element, null, 'user1');
      throw new Error('Should reject null stream');
    } catch (e) {
      if (!e.message.includes('Invalid MediaStream')) {
        throw e;
      }
    }
    
    
    try {
      const element = document.createElement('audio');
      await capture.captureElement(element, new MockMediaStream(), '');
      throw new Error('Should reject empty userId');
    } catch (e) {
      if (!e.message.includes('Invalid userId')) {
        throw e;
      }
    }
  });

  
  await test('Track state monitoring', async () => {
    const capture = new VTFAudioCapture();
    await capture.initialize();
    
    const element = document.createElement('audio');
    const stream = new MockMediaStream();
    const track = stream.tracks[0];
    
    await capture.captureElement(element, stream, 'trackUser');
    
    
    track.readyState = 'ended';
    if (track.onended) {
      track.onended();
    }
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (capture.captures.has('trackUser')) {
      throw new Error('Capture not stopped when track ended');
    }
  });

  
  await test('ScriptProcessor fallback', async () => {
    const capture = new VTFAudioCapture();
    capture.workletReady = false; 
    
    await capture.initialize();
    
    const element = document.createElement('audio');
    const stream = new MockMediaStream();
    
    await capture.captureElement(element, stream, 'fallbackUser');
    
    const captureInfo = capture.captures.get('fallbackUser');
    if (captureInfo.processorType !== 'script') {
      throw new Error('Should use script processor as fallback');
    }
    
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    if (capture.stats.fallbackUsed !== 1) {
      throw new Error('Fallback usage not counted');
    }
  });

  
  await test('Cleanup and destruction', async () => {
    const capture = new VTFAudioCapture();
    await capture.initialize();
    
    
    for (let i = 0; i < 3; i++) {
      const element = document.createElement('audio');
      const stream = new MockMediaStream();
      await capture.captureElement(element, stream, `user${i}`);
    }
    
    
    capture.destroy();
    
    if (capture.captures.size !== 0) {
      throw new Error('Captures not cleaned up');
    }
    
    if (capture.isInitialized) {
      throw new Error('Still marked as initialized');
    }
    
    if (capture.audioContext.state !== 'closed') {
      throw new Error('AudioContext not closed');
    }
  });

  
  await test('Maximum captures limit', async () => {
    const capture = new VTFAudioCapture({ maxCaptures: 3 });
    await capture.initialize();
    
    
    for (let i = 0; i < 3; i++) {
      const element = document.createElement('audio');
      const stream = new MockMediaStream();
      await capture.captureElement(element, stream, `maxUser${i}`);
    }
    
    
    try {
      const element = document.createElement('audio');
      const stream = new MockMediaStream();
      await capture.captureElement(element, stream, 'extraUser');
      throw new Error('Should reject when max captures reached');
    } catch (e) {
      if (!e.message.includes('Maximum captures')) {
        throw e;
      }
    }
  });

  
  await test('Statistics and debug info', async () => {
    const capture = new VTFAudioCapture();
    await capture.initialize();
    
    
    const element = document.createElement('audio');
    const stream = new MockMediaStream();
    await capture.captureElement(element, stream, 'statsUser');
    
    
    const userStats = capture.getCaptureStats('statsUser');
    if (!userStats) {
      throw new Error('User stats not available');
    }
    
    if (userStats.userId !== 'statsUser') {
      throw new Error('Wrong user stats returned');
    }
    
    
    const allStats = capture.getAllStats();
    if (allStats.activeCaptures !== 1) {
      throw new Error('Active captures count wrong');
    }
    
    
    const debug = capture.debug();
    if (!debug.isInitialized) {
      throw new Error('Debug shows not initialized');
    }
    
    if (!debug.captures.statsUser) {
      throw new Error('Debug missing capture info');
    }
  });

  
  window.chrome = originalChrome;
  window.AudioContext = originalAudioContext;
  window.AudioWorkletNode = originalAudioWorkletNode;
  delete window.VTFAudioWorkletNode;

  
  
  if (failed > 0) {
    console.error(`\n⚠️  ${failed} tests failed!`);
  } else {
    
  }
  
  return { passed, failed };
}

runTests().then(results => {
  
});