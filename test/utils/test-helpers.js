/**
 * VTF Audio Extension - Test Helpers
 * 
 * Shared utilities for testing VTF modules
 */

// Simple assertion helpers (no external dependencies)
const assert = {
  equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, but got ${actual}`);
    }
  },
  
  strictEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, but got ${actual}`);
    }
  },
  
  deepEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(message || `Objects not equal: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
    }
  },
  
  ok(value, message) {
    if (!value) {
      throw new Error(message || `Expected truthy value, got ${value}`);
    }
  },
  
  throws(fn, message) {
    let threw = false;
    try {
      fn();
    } catch (e) {
      threw = true;
    }
    if (!threw) {
      throw new Error(message || 'Expected function to throw');
    }
  },
  
  async rejects(asyncFn, message) {
    let threw = false;
    try {
      await asyncFn();
    } catch (e) {
      threw = true;
    }
    if (!threw) {
      throw new Error(message || 'Expected async function to reject');
    }
  }
};

// Test runner helpers
function describe(name, fn) {
  console.log(`\n📦 ${name}`);
  fn();
}

function it(description, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      // Handle async tests
      return result
        .then(() => console.log(`  ✅ ${description}`))
        .catch(error => {
          console.error(`  ❌ ${description}`);
          console.error(`     ${error.message}`);
          throw error;
        });
    } else {
      console.log(`  ✅ ${description}`);
    }
  } catch (error) {
    console.error(`  ❌ ${description}`);
    console.error(`     ${error.message}`);
    throw error;
  }
}

// Mock Chrome APIs
function createMockChromeAPI() {
  return {
    runtime: {
      id: 'test-extension-id',
      getURL: (path) => `chrome-extension://test-extension-id/${path}`,
      sendMessage: (message, callback) => {
        if (callback) callback({ mocked: true });
        return Promise.resolve({ mocked: true });
      },
      onMessage: {
        addListener: () => {},
        removeListener: () => {}
      },
      lastError: null
    },
    
    storage: {
      local: {
        data: {},
        get: function(keys, callback) {
          const result = {};
          if (Array.isArray(keys)) {
            keys.forEach(key => {
              if (this.data[key] !== undefined) {
                result[key] = this.data[key];
              }
            });
          } else if (typeof keys === 'string') {
            if (this.data[keys] !== undefined) {
              result[keys] = this.data[keys];
            }
          } else if (keys === null || keys === undefined) {
            Object.assign(result, this.data);
          }
          
          if (callback) callback(result);
          return Promise.resolve(result);
        },
        set: function(items, callback) {
          Object.assign(this.data, items);
          if (callback) callback();
          return Promise.resolve();
        },
        clear: function(callback) {
          this.data = {};
          if (callback) callback();
          return Promise.resolve();
        }
      }
    },
    
    tabs: {
      query: (options, callback) => {
        const tabs = [{ id: 1, url: 'https://vtf.t3live.com/' }];
        if (callback) callback(tabs);
        return Promise.resolve(tabs);
      },
      sendMessage: (tabId, message, callback) => {
        if (callback) callback({ mocked: true });
        return Promise.resolve({ mocked: true });
      }
    }
  };
}

// Mock VTF DOM environment
function createMockVTFEnvironment() {
  // Mock audio element
  class MockAudioElement {
    constructor() {
      this.id = '';
      this.srcObject = null;
      this.paused = true;
      this.volume = 1.0;
      this.currentTime = 0;
      this.isConnected = true;
      this.autoplay = false;
    }
    
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    
    pause() {
      this.paused = true;
    }
    
    addEventListener() {}
    removeEventListener() {}
  }
  
  // Mock MediaStream
  class MockMediaStream {
    constructor() {
      this.id = 'mock-stream-' + Math.random();
      this.active = true;
      this.tracks = [new MockMediaStreamTrack()];
    }
    
    getAudioTracks() {
      return this.tracks;
    }
    
    getTracks() {
      return this.tracks;
    }
  }
  
  // Mock MediaStreamTrack
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
  
  // Mock DOM
  const mockDOM = {
    elements: new Map(),
    
    getElementById(id) {
      return this.elements.get(id) || null;
    },
    
    createElement(tagName) {
      if (tagName === 'audio') {
        return new MockAudioElement();
      }
      return {
        tagName,
        id: '',
        appendChild: () => {},
        innerHTML: '',
        style: {}
      };
    },
    
    querySelectorAll(selector) {
      const results = [];
      if (selector === 'audio[id^="msRemAudio-"]') {
        this.elements.forEach((el, id) => {
          if (id.startsWith('msRemAudio-') && el.tagName === 'AUDIO') {
            results.push(el);
          }
        });
      }
      return results;
    }
  };
  
  // Mock VTF globals
  const mockGlobals = {
    audioVolume: 0.75,
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
  
  // Mock jQuery
  const $ = (selector) => {
    if (selector.startsWith('#')) {
      const el = mockDOM.getElementById(selector.slice(1));
      return {
        length: el ? 1 : 0,
        get: () => el,
        prop: (prop, value) => {
          if (el && value !== undefined) {
            el[prop] = value;
          }
        },
        remove: () => {
          if (el) mockDOM.elements.delete(el.id);
        }
      };
    }
    return {
      length: 0,
      prop: () => {},
      remove: () => {}
    };
  };
  
  return {
    document: mockDOM,
    window: {
      AudioContext: class {
        constructor() {
          this.state = 'running';
          this.sampleRate = 16000;
        }
        createMediaStreamSource() {
          return { connect: () => {}, disconnect: () => {} };
        }
        createScriptProcessor() {
          return { 
            connect: () => {}, 
            disconnect: () => {},
            onaudioprocess: null
          };
        }
        createGain() {
          return {
            gain: { value: 1.0 },
            connect: () => {},
            disconnect: () => {}
          };
        }
      },
      MediaStream: MockMediaStream,
      globals: mockGlobals,
      $,
      jQuery: $
    },
    MockAudioElement,
    MockMediaStream,
    MockMediaStreamTrack
  };
}

// Async test utilities
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitFor(condition, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - start > timeout) {
        reject(new Error('Timeout waiting for condition'));
      } else {
        setTimeout(check, 50);
      }
    };
    
    check();
  });
}

// Export everything
module.exports = {
  assert,
  describe,
  it,
  createMockChromeAPI,
  createMockVTFEnvironment,
  wait,
  waitFor
};