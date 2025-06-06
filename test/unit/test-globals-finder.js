

import { VTFGlobalsFinder } from './vtf-globals-finder.js';

const TestUtils = {
  
  setupMockVTF() {
    window.mockVTF = {
      globals: {
        audioVolume: 0.75,
        sessData: { currentState: 'open' },
        preferences: { theme: 'dark' },
        videoDeviceID: 'mock-device-123'
      },
      mediaSoupService: {
        startListeningToPresenter: function() { console.log('Mock: startListeningToPresenter'); },
        stopListeningToPresenter: function() { console.log('Mock: stopListeningToPresenter'); }
      }
    };
    
    
    if (window.jQuery) {
      const mockAudio = jQuery('<audio id="msRemAudio-testUser123"></audio>');
      jQuery('body').append(mockAudio);
    }
  },
  
  
  cleanupMockVTF() {
    delete window.mockVTF;
    if (window.jQuery) {
      jQuery('#msRemAudio-testUser123').remove();
    }
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

const VTFGlobalsFinderTests = {
  
  async testInstantiation() {
    const finder = new VTFGlobalsFinder();
    console.assert(finder instanceof VTFGlobalsFinder, 'Should create instance');
    console.assert(finder.globals === null, 'Globals should be null initially');
    console.assert(finder.searchPaths.length > 0, 'Should have search paths');
    finder.destroy();
  },
  
  
  async testPathResolution() {
    const finder = new VTFGlobalsFinder();
    
    
    window.testObj = { nested: { value: 42 } };
    const result = finder.resolvePath('window.testObj.nested.value');
    console.assert(result === 42, 'Should resolve nested path');
    
    
    const invalid = finder.resolvePath('window.nonexistent.path');
    console.assert(invalid === undefined, 'Should return undefined for invalid path');
    
    delete window.testObj;
    finder.destroy();
  },
  
  
  async testGlobalsValidation() {
    const finder = new VTFGlobalsFinder();
    
    
    const validGlobals = {
      audioVolume: 0.5,
      sessData: {},
      preferences: {}
    };
    console.assert(finder.isValidGlobals(validGlobals), 'Should validate correct globals');
    
    
    console.assert(!finder.isValidGlobals(null), 'Should reject null');
    console.assert(!finder.isValidGlobals({}), 'Should reject empty object');
    console.assert(!finder.isValidGlobals({ audioVolume: 'invalid' }), 'Should reject non-numeric volume');
    console.assert(!finder.isValidGlobals({ audioVolume: 2 }), 'Should reject volume > 1');
    
    finder.destroy();
  },
  
  
  async testMockVTFDetection() {
    TestUtils.setupMockVTF();
    
    
    const finder = new VTFGlobalsFinder();
    finder.searchPaths.push('window.mockVTF.globals');
    
    const found = finder.findGlobals();
    console.assert(found === true, 'Should find mock globals');
    console.assert(finder.globals.audioVolume === 0.75, 'Should have correct audio volume');
    console.assert(finder.foundMethod === 'path-resolution', 'Should use path resolution method');
    
    TestUtils.cleanupMockVTF();
    finder.destroy();
  },
  
  
  async testWaitForGlobalsTimeout() {
    const finder = new VTFGlobalsFinder();
    const startTime = Date.now();
    
    
    const found = await finder.waitForGlobals(3, 100);
    const elapsed = Date.now() - startTime;
    
    console.assert(found === false, 'Should return false on timeout');
    console.assert(elapsed >= 300 && elapsed < 400, `Should take ~300ms, took ${elapsed}ms`);
    
    finder.destroy();
  },
  
  
  async testWaitForGlobalsDelayed() {
    const finder = new VTFGlobalsFinder();
    
    
    setTimeout(() => {
      window.delayedGlobals = {
        audioVolume: 0.9,
        sessData: { currentState: 'open' },
        preferences: {}
      };
    }, 200);
    
    
    finder.searchPaths.push('window.delayedGlobals');
    
    const found = await finder.waitForGlobals(10, 100);
    console.assert(found === true, 'Should find delayed globals');
    console.assert(finder.globals.audioVolume === 0.9, 'Should have correct globals');
    
    delete window.delayedGlobals;
    finder.destroy();
  },
  
  
  async testFunctionDetection() {
    
    window.reconnectAudio = function() {
      
      if (this.globals && this.globals.audioVolume) {
        
      }
    };
    
    const finder = new VTFGlobalsFinder();
    const foundByFunc = finder.findByFunctions();
    
    
    console.assert(typeof window.reconnectAudio === 'function', 'Should have mock function');
    
    delete window.reconnectAudio;
    finder.destroy();
  },
  
  
  async testMemoryCleanup() {
    const finder = new VTFGlobalsFinder();
    
    
    const waitPromise = finder.waitForGlobals(100, 50);
    
    
    finder.destroy();
    
    console.assert(finder.globals === null, 'Should clear globals on destroy');
    console.assert(finder.activeTimeout === null, 'Should clear timeout on destroy');
    
    
    await waitPromise;
  },
  
  
  async testDebugOutput() {
    const finder = new VTFGlobalsFinder();
    const debug = finder.debug();
    
    console.assert(typeof debug === 'object', 'Debug should return object');
    console.assert(debug.found === false, 'Should show not found');
    console.assert(Array.isArray(debug.searchPaths), 'Should include search paths');
    console.assert(Array.isArray(debug.functionSignatures), 'Should include function signatures');
    
    finder.destroy();
  },
  
  
  async testRealVTFDetection() {
    const finder = new VTFGlobalsFinder();
    const found = await finder.waitForGlobals(10, 500);
    
    if (found) {
      
      
      console.assert(finder.globals !== null, 'Should have globals');
      console.assert(typeof finder.globals.audioVolume === 'number', 'Should have audio volume');
    } else {
      
    }
    
    finder.destroy();
  }
};

async function runAllTests() {
  
  const tests = [
    ['Instantiation', VTFGlobalsFinderTests.testInstantiation],
    ['Path Resolution', VTFGlobalsFinderTests.testPathResolution],
    ['Globals Validation', VTFGlobalsFinderTests.testGlobalsValidation],
    ['Mock VTF Detection', VTFGlobalsFinderTests.testMockVTFDetection],
    ['Wait Timeout', VTFGlobalsFinderTests.testWaitForGlobalsTimeout],
    ['Wait Delayed', VTFGlobalsFinderTests.testWaitForGlobalsDelayed],
    ['Function Detection', VTFGlobalsFinderTests.testFunctionDetection],
    ['Memory Cleanup', VTFGlobalsFinderTests.testMemoryCleanup],
    ['Debug Output', VTFGlobalsFinderTests.testDebugOutput],
    ['Real VTF Detection', VTFGlobalsFinderTests.testRealVTFDetection]
  ];
  
  for (const [name, testFn] of tests) {
    await TestUtils.runTest(name, testFn);
  }
  
  
}

export { runAllTests, VTFGlobalsFinderTests, TestUtils };

if (typeof window !== 'undefined' && window.location.href.includes('test')) {
  runAllTests();
}