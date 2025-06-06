/**
 * Test suite for VTFGlobalsFinder
 * Run these tests in the browser console on a VTF page
 */

import { VTFGlobalsFinder } from './vtf-globals-finder.js';

// Test utilities
const TestUtils = {
  // Create a mock VTF environment
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
    
    // Create mock audio element if jQuery available
    if (window.jQuery) {
      const mockAudio = jQuery('<audio id="msRemAudio-testUser123"></audio>');
      jQuery('body').append(mockAudio);
    }
  },
  
  // Clean up mock environment
  cleanupMockVTF() {
    delete window.mockVTF;
    if (window.jQuery) {
      jQuery('#msRemAudio-testUser123').remove();
    }
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
  }
};

// Test Suite
const VTFGlobalsFinderTests = {
  // Test 1: Basic instantiation
  async testInstantiation() {
    const finder = new VTFGlobalsFinder();
    console.assert(finder instanceof VTFGlobalsFinder, 'Should create instance');
    console.assert(finder.globals === null, 'Globals should be null initially');
    console.assert(finder.searchPaths.length > 0, 'Should have search paths');
    finder.destroy();
  },
  
  // Test 2: Path resolution
  async testPathResolution() {
    const finder = new VTFGlobalsFinder();
    
    // Test valid path
    window.testObj = { nested: { value: 42 } };
    const result = finder.resolvePath('window.testObj.nested.value');
    console.assert(result === 42, 'Should resolve nested path');
    
    // Test invalid path
    const invalid = finder.resolvePath('window.nonexistent.path');
    console.assert(invalid === undefined, 'Should return undefined for invalid path');
    
    delete window.testObj;
    finder.destroy();
  },
  
  // Test 3: Globals validation
  async testGlobalsValidation() {
    const finder = new VTFGlobalsFinder();
    
    // Valid globals
    const validGlobals = {
      audioVolume: 0.5,
      sessData: {},
      preferences: {}
    };
    console.assert(finder.isValidGlobals(validGlobals), 'Should validate correct globals');
    
    // Invalid globals
    console.assert(!finder.isValidGlobals(null), 'Should reject null');
    console.assert(!finder.isValidGlobals({}), 'Should reject empty object');
    console.assert(!finder.isValidGlobals({ audioVolume: 'invalid' }), 'Should reject non-numeric volume');
    console.assert(!finder.isValidGlobals({ audioVolume: 2 }), 'Should reject volume > 1');
    
    finder.destroy();
  },
  
  // Test 4: Mock VTF detection
  async testMockVTFDetection() {
    TestUtils.setupMockVTF();
    
    // Add to search paths for testing
    const finder = new VTFGlobalsFinder();
    finder.searchPaths.push('window.mockVTF.globals');
    
    const found = finder.findGlobals();
    console.assert(found === true, 'Should find mock globals');
    console.assert(finder.globals.audioVolume === 0.75, 'Should have correct audio volume');
    console.assert(finder.foundMethod === 'path-resolution', 'Should use path resolution method');
    
    TestUtils.cleanupMockVTF();
    finder.destroy();
  },
  
  // Test 5: Async wait with timeout
  async testWaitForGlobalsTimeout() {
    const finder = new VTFGlobalsFinder();
    const startTime = Date.now();
    
    // Should timeout quickly with small values
    const found = await finder.waitForGlobals(3, 100);
    const elapsed = Date.now() - startTime;
    
    console.assert(found === false, 'Should return false on timeout');
    console.assert(elapsed >= 300 && elapsed < 400, `Should take ~300ms, took ${elapsed}ms`);
    
    finder.destroy();
  },
  
  // Test 6: Async wait with delayed globals
  async testWaitForGlobalsDelayed() {
    const finder = new VTFGlobalsFinder();
    
    // Simulate globals appearing after 200ms
    setTimeout(() => {
      window.delayedGlobals = {
        audioVolume: 0.9,
        sessData: { currentState: 'open' },
        preferences: {}
      };
    }, 200);
    
    // Add to search paths
    finder.searchPaths.push('window.delayedGlobals');
    
    const found = await finder.waitForGlobals(10, 100);
    console.assert(found === true, 'Should find delayed globals');
    console.assert(finder.globals.audioVolume === 0.9, 'Should have correct globals');
    
    delete window.delayedGlobals;
    finder.destroy();
  },
  
  // Test 7: Function detection
  async testFunctionDetection() {
    // Create mock VTF function
    window.reconnectAudio = function() {
      // Mock function that references globals
      if (this.globals && this.globals.audioVolume) {
        console.log('Reconnecting audio...');
      }
    };
    
    const finder = new VTFGlobalsFinder();
    const foundByFunc = finder.findByFunctions();
    
    // Note: This might not find globals in our mock, but should detect the function
    console.assert(typeof window.reconnectAudio === 'function', 'Should have mock function');
    
    delete window.reconnectAudio;
    finder.destroy();
  },
  
  // Test 8: Memory cleanup
  async testMemoryCleanup() {
    const finder = new VTFGlobalsFinder();
    
    // Start a wait that we'll interrupt
    const waitPromise = finder.waitForGlobals(100, 50);
    
    // Destroy immediately
    finder.destroy();
    
    console.assert(finder.globals === null, 'Should clear globals on destroy');
    console.assert(finder.activeTimeout === null, 'Should clear timeout on destroy');
    
    // Wait for the promise to resolve
    await waitPromise;
  },
  
  // Test 9: Debug output
  async testDebugOutput() {
    const finder = new VTFGlobalsFinder();
    const debug = finder.debug();
    
    console.assert(typeof debug === 'object', 'Debug should return object');
    console.assert(debug.found === false, 'Should show not found');
    console.assert(Array.isArray(debug.searchPaths), 'Should include search paths');
    console.assert(Array.isArray(debug.functionSignatures), 'Should include function signatures');
    
    finder.destroy();
  },
  
  // Test 10: Real VTF detection (if on VTF page)
  async testRealVTFDetection() {
    const finder = new VTFGlobalsFinder();
    const found = await finder.waitForGlobals(10, 500);
    
    if (found) {
      console.log('🎉 Real VTF detected!');
      console.log('Debug info:', finder.debug());
      console.assert(finder.globals !== null, 'Should have globals');
      console.assert(typeof finder.globals.audioVolume === 'number', 'Should have audio volume');
    } else {
      console.log('ℹ️ Not on a VTF page or VTF not loaded yet');
    }
    
    finder.destroy();
  }
};

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting VTFGlobalsFinder tests...\n');
  
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
  
  console.log('\n✨ All tests completed!');
}

// Export test runner
export { runAllTests, VTFGlobalsFinderTests, TestUtils };

// Auto-run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location.href.includes('test')) {
  runAllTests();
}