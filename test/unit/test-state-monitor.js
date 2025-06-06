/**
 * Test suite for VTFStateMonitor
 * Run these tests in the browser console
 */

import { VTFStateMonitor } from './vtf-state-monitor.js';

// Test utilities
const TestUtils = {
  // Create mock globals finder
  createMockGlobalsFinder() {
    return {
      globals: {
        audioVolume: 0.75,
        sessData: { currentState: 'open' },
        preferences: {
          theme: 'dark',
          autoStart: true
        },
        talkingUsers: new Map([
          ['user1', { name: 'Alice' }],
          ['user2', { name: 'Bob' }]
        ])
      },
      mediaSoupService: {
        reconnectAudio: function() { console.log('Mock: reconnectAudio'); }
      },
      appService: {
        adjustVol: function(event) { console.log('Mock: adjustVol'); }
      }
    };
  },
  
  // Wait helper
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
const VTFStateMonitorTests = {
  // Test 1: Basic instantiation
  async testInstantiation() {
    const monitor = new VTFStateMonitor();
    console.assert(monitor instanceof VTFStateMonitor, 'Should create instance');
    console.assert(monitor.lastKnownState.volume === 1.0, 'Should have default volume');
    console.assert(monitor.lastKnownState.sessionState === 'unknown', 'Should have unknown state');
    monitor.destroy();
  },
  
  // Test 2: Start/stop sync
  async testStartStopSync() {
    const monitor = new VTFStateMonitor();
    const mockFinder = TestUtils.createMockGlobalsFinder();
    
    // Start sync
    const started = monitor.startSync(mockFinder, 100);
    console.assert(started === true, 'Should start sync');
    console.assert(monitor.syncInterval !== null, 'Should have sync interval');
    
    await TestUtils.wait(250);
    console.assert(monitor.syncCount > 0, 'Should have synced');
    
    // Stop sync
    monitor.stopSync();
    console.assert(monitor.syncInterval === null, 'Should clear interval');
    
    monitor.destroy();
  },
  
  // Test 3: Volume change detection
  async testVolumeChange() {
    const monitor = new VTFStateMonitor({ volumeThreshold: 0.01 });
    const mockFinder = TestUtils.createMockGlobalsFinder();
    
    let volumeChanges = [];
    monitor.on('onVolumeChanged', (newVol, oldVol) => {
      volumeChanges.push({ newVol, oldVol });
    });
    
    monitor.startSync(mockFinder, 50);
    
    await TestUtils.wait(100);
    
    // Change volume
    mockFinder.globals.audioVolume = 0.5;
    await TestUtils.wait(100);
    
    console.assert(volumeChanges.length > 0, 'Should detect volume change');
    console.assert(volumeChanges[0].newVol === 0.5, 'Should have new volume');
    console.assert(volumeChanges[0].oldVol === 0.75, 'Should have old volume');
    
    monitor.destroy();
  },
  
  // Test 4: Session state change
  async testSessionStateChange() {
    const monitor = new VTFStateMonitor();
    const mockFinder = TestUtils.createMockGlobalsFinder();
    
    let stateChanges = [];
    monitor.on('onSessionStateChanged', (newState, oldState) => {
      stateChanges.push({ newState, oldState });
    });
    
    monitor.startSync(mockFinder, 50);
    await TestUtils.wait(100);
    
    // Change state
    mockFinder.globals.sessData.currentState = 'closed';
    await TestUtils.wait(100);
    
    console.assert(stateChanges.length > 0, 'Should detect state change');
    console.assert(stateChanges[0].newState === 'closed', 'Should have new state');
    console.assert(stateChanges[0].oldState === 'open', 'Should have old state');
    
    monitor.destroy();
  },
  
  // Test 5: Talking users change
  async testTalkingUsersChange() {
    const monitor = new VTFStateMonitor();
    const mockFinder = TestUtils.createMockGlobalsFinder();
    
    let userChanges = [];
    monitor.on('onTalkingUsersChanged', (newUsers, oldUsers) => {
      userChanges.push({ newSize: newUsers.size, oldSize: oldUsers.size });
    });
    
    monitor.startSync(mockFinder, 50);
    await TestUtils.wait(100);
    
    // Add user
    mockFinder.globals.talkingUsers.set('user3', { name: 'Charlie' });
    await TestUtils.wait(100);
    
    console.assert(userChanges.length > 0, 'Should detect user change');
    console.assert(userChanges[0].newSize === 3, 'Should have 3 users');
    console.assert(userChanges[0].oldSize === 2, 'Should have had 2 users');
    
    monitor.destroy();
  },
  
  // Test 6: Function hooking
  async testFunctionHooking() {
    const monitor = new VTFStateMonitor();
    const mockFinder = TestUtils.createMockGlobalsFinder();
    
    let reconnectCalled = false;
    monitor.on('onReconnect', (count) => {
      reconnectCalled = true;
    });
    
    // Add function to window for testing
    window.testReconnectAudio = function() { return 'original'; };
    mockFinder.mediaSoupService.reconnectAudio = window.testReconnectAudio;
    
    monitor.startSync(mockFinder, 1000);
    
    // Call hooked function
    const result = mockFinder.mediaSoupService.reconnectAudio();
    
    console.assert(reconnectCalled === true, 'Should trigger reconnect event');
    console.assert(result === 'original', 'Should preserve original behavior');
    console.assert(monitor.lastKnownState.reconnectCount === 1, 'Should increment count');
    
    // Clean up
    delete window.testReconnectAudio;
    monitor.destroy();
  },
  
  // Test 7: Event listeners
  async testEventListeners() {
    const monitor = new VTFStateMonitor();
    
    let callCount = 0;
    const listener1 = () => callCount++;
    const listener2 = () => callCount++;
    
    // Add listeners
    console.assert(monitor.on('onVolumeChanged', listener1) === true, 'Should add listener');
    console.assert(monitor.on('onVolumeChanged', listener2) === true, 'Should add second listener');
    console.assert(monitor.on('invalidEvent', listener1) === false, 'Should reject invalid event');
    
    // Emit event
    monitor.emit('onVolumeChanged', 1.0, 0.5);
    console.assert(callCount === 2, 'Should call both listeners');
    
    // Remove listener
    console.assert(monitor.off('onVolumeChanged', listener1) === true, 'Should remove listener');
    
    // Emit again
    callCount = 0;
    monitor.emit('onVolumeChanged', 0.8, 1.0);
    console.assert(callCount === 1, 'Should call remaining listener');
    
    monitor.destroy();
  },
  
  // Test 8: Preferences change
  async testPreferencesChange() {
    const monitor = new VTFStateMonitor();
    const mockFinder = TestUtils.createMockGlobalsFinder();
    
    let prefChanges = [];
    monitor.on('onPreferencesChanged', (newPrefs, oldPrefs) => {
      prefChanges.push({ new: newPrefs, old: oldPrefs });
    });
    
    monitor.startSync(mockFinder, 50);
    await TestUtils.wait(100);
    
    // Change preferences
    mockFinder.globals.preferences.theme = 'light';
    mockFinder.globals.preferences.newPref = true;
    await TestUtils.wait(100);
    
    console.assert(prefChanges.length > 0, 'Should detect preference change');
    console.assert(prefChanges[0].new.theme === 'light', 'Should have new theme');
    console.assert(prefChanges[0].old.theme === 'dark', 'Should have old theme');
    
    monitor.destroy();
  },
  
  // Test 9: Error handling
  async testErrorHandling() {
    const monitor = new VTFStateMonitor();
    const mockFinder = { globals: null }; // Invalid globals
    
    let errors = [];
    monitor.on('onSyncError', (error) => {
      errors.push(error);
    });
    
    monitor.startSync(mockFinder, 50);
    await TestUtils.wait(100);
    
    // Should handle missing globals gracefully
    console.assert(monitor.errorCount === 0, 'Should not count as error');
    
    // Cause an error by breaking globals
    mockFinder.globals = { get audioVolume() { throw new Error('Test error'); } };
    await TestUtils.wait(100);
    
    console.assert(errors.length > 0, 'Should emit sync error');
    console.assert(monitor.errorCount > 0, 'Should count errors');
    
    monitor.destroy();
  },
  
  // Test 10: State snapshot
  async testStateSnapshot() {
    const monitor = new VTFStateMonitor();
    const mockFinder = TestUtils.createMockGlobalsFinder();
    
    monitor.startSync(mockFinder, 50);
    await TestUtils.wait(100);
    
    const state = monitor.getState();
    console.assert(typeof state === 'object', 'Should return state object');
    console.assert(state.volume === 0.75, 'Should have current volume');
    console.assert(state.sessionState === 'open', 'Should have session state');
    console.assert(state.talkingUsersCount === 2, 'Should have user count');
    console.assert(state.isActive === true, 'Should show active');
    console.assert(typeof state.lastSync === 'number', 'Should have sync time');
    
    // Test debug output
    const debug = monitor.debug();
    console.assert(debug.syncCount > 0, 'Should have sync count');
    console.assert(debug.hookedFunctions.length > 0, 'Should have hooked functions');
    
    monitor.destroy();
  }
};

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting VTFStateMonitor tests...\n');
  
  const tests = [
    ['Instantiation', VTFStateMonitorTests.testInstantiation],
    ['Start/Stop Sync', VTFStateMonitorTests.testStartStopSync],
    ['Volume Change', VTFStateMonitorTests.testVolumeChange],
    ['Session State Change', VTFStateMonitorTests.testSessionStateChange],
    ['Talking Users Change', VTFStateMonitorTests.testTalkingUsersChange],
    ['Function Hooking', VTFStateMonitorTests.testFunctionHooking],
    ['Event Listeners', VTFStateMonitorTests.testEventListeners],
    ['Preferences Change', VTFStateMonitorTests.testPreferencesChange],
    ['Error Handling', VTFStateMonitorTests.testErrorHandling],
    ['State Snapshot', VTFStateMonitorTests.testStateSnapshot]
  ];
  
  for (const [name, testFn] of tests) {
    await TestUtils.runTest(name, testFn);
  }
  
  console.log('\n✨ All tests completed!');
}

// Export test functions
export { runAllTests, VTFStateMonitorTests, TestUtils };

// Auto-run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location.href.includes('test')) {
  runAllTests();
}