/**
 * Test Harness for VTF Extension Foundation Modules
 * Orchestrates testing of VTFGlobalsFinder, VTFStreamMonitor, and VTFStateMonitor
 */

import { VTFGlobalsFinder } from '../../src/modules/vtf-globals-finder.js';
import { VTFStreamMonitor } from '../../src/modules/vtf-stream-monitor.js';
import { VTFStateMonitor } from '../../src/modules/vtf-state-monitor.js';

class VTFTestHarness {
  constructor() {
    // Module instances
    this.globalsFinder = null;
    this.streamMonitor = null;
    this.stateMonitor = null;
    
    // Test state
    this.isRunning = false;
    this.currentScenario = null;
    this.testResults = new Map();
    
    // Metrics
    this.metrics = {
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      startTime: null,
      eventCounts: {
        volumeChanges: 0,
        stateChanges: 0,
        reconnects: 0,
        streamDetections: 0
      }
    };
    
    // UI elements
    this.ui = {
      log: document.getElementById('test-log'),
      results: document.getElementById('test-results'),
      runAllBtn: document.getElementById('run-all-btn')
    };
  }
  
  /**
   * Initialize the test harness
   */
  initialize() {
    this.log('Test harness initialized', 'info');
    this.updateUI();
    
    // Set up global error handler
    window.addEventListener('error', (e) => {
      this.log(`Global error: ${e.message}`, 'error');
    });
  }
  
  /**
   * Run all test scenarios
   */
  async runAllTests() {
    if (this.isRunning) {
      this.log('Tests already running', 'warning');
      return;
    }
    
    this.isRunning = true;
    this.metrics.startTime = Date.now();
    this.ui.runAllBtn.disabled = true;
    
    this.log('Starting all test scenarios...', 'info');
    this.clearResults();
    
    const scenarios = [
      'coldStart',
      'hotStart', 
      'audioLifecycle',
      'stateChanges',
      'errorRecovery'
    ];
    
    for (const scenario of scenarios) {
      if (!this.isRunning) break;
      
      await this.runScenario(scenario);
      await this.wait(1000); // Pause between scenarios
    }
    
    this.isRunning = false;
    this.ui.runAllBtn.disabled = false;
    
    this.showSummary();
  }
  
  /**
   * Run a specific test scenario
   */
  async runScenario(scenarioName) {
    this.currentScenario = scenarioName;
    const resultId = `scenario-${scenarioName}`;
    
    this.log(`\n📋 Running scenario: ${scenarioName}`, 'info');
    this.addResult(resultId, scenarioName, 'running');
    
    try {
      // Reset environment before each scenario
      await this.resetEnvironment();
      await this.wait(500);
      
      // Run the scenario
      switch (scenarioName) {
        case 'coldStart':
          await this.scenarioColdStart();
          break;
        case 'hotStart':
          await this.scenarioHotStart();
          break;
        case 'audioLifecycle':
          await this.scenarioAudioLifecycle();
          break;
        case 'stateChanges':
          await this.scenarioStateChanges();
          break;
        case 'errorRecovery':
          await this.scenarioErrorRecovery();
          break;
        default:
          throw new Error(`Unknown scenario: ${scenarioName}`);
      }
      
      this.metrics.testsPassed++;
      this.updateResult(resultId, 'passed');
      this.log(`✅ Scenario ${scenarioName} passed`, 'success');
      
    } catch (error) {
      this.metrics.testsFailed++;
      this.updateResult(resultId, 'failed');
      this.log(`❌ Scenario ${scenarioName} failed: ${error.message}`, 'error');
      console.error(error);
    } finally {
      this.metrics.testsRun++;
      this.currentScenario = null;
    }
  }
  
  /**
   * Scenario 1: Cold Start
   * Load page without VTF globals, then add them
   */
  async scenarioColdStart() {
    this.log('Testing cold start (no VTF globals initially)', 'info');
    
    // Ensure no VTF globals exist
    window.appService = undefined;
    window.mediaSoupService = undefined;
    
    // Initialize modules
    this.globalsFinder = new VTFGlobalsFinder();
    this.streamMonitor = new VTFStreamMonitor();
    this.stateMonitor = new VTFStateMonitor();
    
    // Start searching for globals (should not find them)
    const searchPromise = this.globalsFinder.waitForGlobals(10, 500);
    
    this.log('Waiting 2 seconds before adding VTF globals...', 'info');
    await this.wait(2000);
    
    // Add VTF globals
    this.log('Adding VTF globals', 'info');
    window.setupMockVTF({
      volume: 0.8,
      sessionState: 'connecting'
    });
    
    // Wait for detection
    const found = await searchPromise;
    this.assert(found === true, 'Globals should be found after adding');
    this.assert(this.globalsFinder.globals !== null, 'Globals should be set');
    this.assert(this.globalsFinder.globals.audioVolume === 0.8, 'Volume should match');
    
    // Start state monitoring
    this.stateMonitor.startSync(this.globalsFinder);
    await this.wait(100);
    
    const state = this.stateMonitor.getState();
    this.assert(state.volume === 0.8, 'State monitor should have correct volume');
    this.assert(state.sessionState === 'connecting', 'State monitor should have correct session state');
    
    this.updateModuleStatus();
  }
  
  /**
   * Scenario 2: Hot Start
   * VTF globals and audio elements already present
   */
  async scenarioHotStart() {
    this.log('Testing hot start (VTF already loaded)', 'info');
    
    // Set up VTF environment with audio elements
    window.setupMockVTF({
      createAudioElements: true,
      volume: 1.0,
      sessionState: 'open'
    });
    
    // Initialize modules
    this.globalsFinder = new VTFGlobalsFinder();
    this.streamMonitor = new VTFStreamMonitor();
    this.stateMonitor = new VTFStateMonitor();
    
    // Should find globals immediately
    const startTime = Date.now();
    const found = await this.globalsFinder.waitForGlobals();
    const searchTime = Date.now() - startTime;
    
    this.assert(found === true, 'Should find globals immediately');
    this.assert(searchTime < 100, `Should find quickly (took ${searchTime}ms)`);
    
    // Check existing audio elements
    const audioElements = document.querySelectorAll('[id^="msRemAudio-"]');
    this.assert(audioElements.length === 2, 'Should have 2 audio elements');
    
    // Monitor existing elements
    let detectionCount = 0;
    audioElements.forEach(element => {
      const userId = element.id.replace('msRemAudio-', '');
      this.streamMonitor.startMonitoring(element, userId, (stream) => {
        detectionCount++;
        this.log(`Stream detected for ${userId}`, 'success');
      });
    });
    
    // Start state sync
    this.stateMonitor.startSync(this.globalsFinder);
    
    this.updateModuleStatus();
  }
  
  /**
   * Scenario 3: Audio Element Lifecycle
   * Test element creation, stream assignment, and removal
   */
  async scenarioAudioLifecycle() {
    this.log('Testing audio element lifecycle', 'info');
    
    // Set up environment
    window.setupMockVTF();
    await this.initializeModules();
    
    // Create audio element
    const userId = 'testUser123';
    const audio = this.createAudioElement(userId);
    
    let streamDetected = false;
    let streamValidated = false;
    
    // Start monitoring
    this.streamMonitor.startMonitoring(audio, userId, async (stream) => {
      this.log(`Stream callback triggered for ${userId}`, 'info');
      streamDetected = true;
      
      if (stream) {
        try {
          await this.streamMonitor.waitForStreamReady(stream);
          streamValidated = true;
          this.log('Stream validated successfully', 'success');
        } catch (error) {
          this.log(`Stream validation failed: ${error.message}`, 'error');
        }
      }
    });
    
    this.assert(this.streamMonitor.isMonitoring(userId), 'Should be monitoring user');
    
    // Wait a bit then assign stream
    await this.wait(1000);
    
    this.log('Assigning mock stream', 'info');
    const mockStream = this.createMockStream();
    audio.srcObject = mockStream;
    
    // Wait for detection
    await this.wait(500);
    
    this.assert(streamDetected === true, 'Stream should be detected');
    this.assert(streamValidated === true, 'Stream should be validated');
    this.assert(!this.streamMonitor.isMonitoring(userId), 'Should stop monitoring after detection');
    
    // Remove element
    this.log('Removing audio element', 'info');
    audio.remove();
    
    // Verify cleanup
    const remainingElements = document.querySelectorAll(`#msRemAudio-${userId}`);
    this.assert(remainingElements.length === 0, 'Element should be removed');
    
    this.updateModuleStatus();
  }
  
  /**
   * Scenario 4: State Changes
   * Test volume, session state, and reconnect events
   */
  async scenarioStateChanges() {
    this.log('Testing state changes', 'info');
    
    // Set up environment
    window.setupMockVTF({
      volume: 0.5,
      sessionState: 'open'
    });
    await this.initializeModules();
    
    // Set up event tracking
    const events = {
      volumeChanges: [],
      stateChanges: [],
      reconnects: []
    };
    
    this.stateMonitor.on('onVolumeChanged', (newVol, oldVol) => {
      events.volumeChanges.push({ newVol, oldVol });
      this.log(`Volume changed: ${oldVol} → ${newVol}`, 'info');
    });
    
    this.stateMonitor.on('onSessionStateChanged', (newState, oldState) => {
      events.stateChanges.push({ newState, oldState });
      this.log(`Session state changed: ${oldState} → ${newState}`, 'info');
    });
    
    this.stateMonitor.on('onReconnect', (count) => {
      events.reconnects.push(count);
      this.log(`Reconnect #${count}`, 'info');
    });
    
    // Start sync
    this.stateMonitor.startSync(this.globalsFinder, 100);
    await this.wait(200);
    
    // Test volume change
    this.log('Changing volume to 0.75', 'info');
    window.appService.globals.audioVolume = 0.75;
    await this.wait(200);
    
    this.assert(events.volumeChanges.length > 0, 'Should detect volume change');
    this.assert(events.volumeChanges[0].newVol === 0.75, 'Should have correct new volume');
    
    // Test session state change
    this.log('Changing session state to closed', 'info');
    window.appService.globals.sessData.currentState = 'closed';
    await this.wait(200);
    
    this.assert(events.stateChanges.length > 0, 'Should detect state change');
    this.assert(events.stateChanges[0].newState === 'closed', 'Should have correct new state');
    
    // Test reconnect
    this.log('Triggering reconnectAudio', 'info');
    window.mediaSoupService.reconnectAudio();
    await this.wait(100);
    
    this.assert(events.reconnects.length > 0, 'Should detect reconnect');
    this.assert(events.reconnects[0] === 1, 'Should be first reconnect');
    
    this.updateModuleStatus();
  }
  
  /**
   * Scenario 5: Error Recovery
   * Test timeout scenarios and error handling
   */
  async scenarioErrorRecovery() {
    this.log('Testing error recovery', 'info');
    
    // Test 1: Globals timeout
    this.log('Test 1: Testing globals finder timeout', 'info');
    this.globalsFinder = new VTFGlobalsFinder();
    
    const startTime = Date.now();
    const found = await this.globalsFinder.waitForGlobals(3, 100); // Short timeout
    const elapsed = Date.now() - startTime;
    
    this.assert(found === false, 'Should timeout when globals not found');
    this.assert(elapsed >= 300 && elapsed < 400, `Should take ~300ms (took ${elapsed}ms)`);
    
    // Test 2: Stream monitor timeout
    this.log('Test 2: Testing stream monitor timeout', 'info');
    window.setupMockVTF();
    this.streamMonitor = new VTFStreamMonitor({
      pollInterval: 50,
      maxPollTime: 200
    });
    
    const audio = this.createAudioElement('timeoutTest');
    let timeoutDetected = false;
    
    this.streamMonitor.startMonitoring(audio, 'timeoutTest', (stream) => {
      if (stream === null) {
        timeoutDetected = true;
        this.log('Stream timeout detected correctly', 'success');
      }
    });
    
    await this.wait(300);
    this.assert(timeoutDetected === true, 'Should detect stream timeout');
    
    // Test 3: Invalid stream
    this.log('Test 3: Testing invalid stream handling', 'info');
    try {
      await this.streamMonitor.waitForStreamReady(null);
      this.assert(false, 'Should throw for invalid stream');
    } catch (error) {
      this.assert(error.message.includes('Invalid stream'), 'Should have correct error message');
      this.log('Invalid stream handled correctly', 'success');
    }
    
    // Test 4: State sync with missing globals
    this.log('Test 4: Testing state sync with missing globals', 'info');
    this.stateMonitor = new VTFStateMonitor();
    const invalidFinder = { globals: null };
    
    // Should handle gracefully
    this.stateMonitor.startSync(invalidFinder, 100);
    await this.wait(200);
    
    const state = this.stateMonitor.getState();
    this.assert(state.volume === 1.0, 'Should have default volume');
    this.assert(state.sessionState === 'unknown', 'Should have unknown state');
    
    this.updateModuleStatus();
  }
  
  /**
   * Initialize all modules
   */
  async initializeModules() {
    this.globalsFinder = new VTFGlobalsFinder();
    this.streamMonitor = new VTFStreamMonitor();
    this.stateMonitor = new VTFStateMonitor();
    
    const found = await this.globalsFinder.waitForGlobals();
    if (found) {
      this.stateMonitor.startSync(this.globalsFinder);
    }
    
    this.updateModuleStatus();
  }
  
  /**
   * Update module status in UI
   */
  updateModuleStatus() {
    // Update GlobalsFinder
    if (this.globalsFinder) {
      const gfDebug = this.globalsFinder.debug();
      document.getElementById('globals-finder-state').textContent = JSON.stringify(gfDebug, null, 2);
      
      const gfStatus = document.getElementById('globals-finder-status');
      if (gfDebug.found) {
        gfStatus.textContent = 'Active';
        gfStatus.className = 'status-badge status-active';
        document.getElementById('gf-found-method').textContent = gfDebug.foundMethod || '-';
      } else {
        gfStatus.textContent = 'Searching';
        gfStatus.className = 'status-badge status-waiting';
      }
      
      if (gfDebug.searchCount > 0) {
        document.getElementById('gf-search-time').textContent = `${gfDebug.searchCount * 500}ms`;
      }
    }
    
    // Update StreamMonitor
    if (this.streamMonitor) {
      const smDebug = this.streamMonitor.debug();
      document.getElementById('stream-monitor-state').textContent = JSON.stringify(smDebug, null, 2);
      
      const smStatus = document.getElementById('stream-monitor-status');
      if (smDebug.monitorCount > 0) {
        smStatus.textContent = 'Monitoring';
        smStatus.className = 'status-badge status-active';
      } else {
        smStatus.textContent = 'Ready';
        smStatus.className = 'status-badge status-waiting';
      }
      
      document.getElementById('sm-active-monitors').textContent = smDebug.monitorCount;
      document.getElementById('sm-detected').textContent = smDebug.stats.monitorsSucceeded;
    }
    
    // Update StateMonitor
    if (this.stateMonitor) {
      const stmDebug = this.stateMonitor.debug();
      document.getElementById('state-monitor-state').textContent = JSON.stringify(stmDebug, null, 2);
      
      const stmStatus = document.getElementById('state-monitor-status');
      if (stmDebug.syncActive) {
        stmStatus.textContent = 'Syncing';
        stmStatus.className = 'status-badge status-active';
      } else {
        stmStatus.textContent = 'Inactive';
        stmStatus.className = 'status-badge status-inactive';
      }
      
      document.getElementById('stm-syncs').textContent = stmDebug.syncCount;
      document.getElementById('stm-events').textContent = 
        Object.values(stmDebug.listenerCounts).reduce((a, b) => a + b, 0);
      document.getElementById('stm-volume').textContent = 
        stmDebug.lastKnownState.volume.toFixed(2);
      document.getElementById('stm-session').textContent = 
        stmDebug.lastKnownState.sessionState;
    }
  }
  
  /**
   * Stop all tests
   */
  stopTests() {
    this.isRunning = false;
    this.log('Stopping tests...', 'warning');
  }
  
  /**
   * Reset test environment
   */
  async resetEnvironment() {
    this.log('Resetting environment', 'info');
    
    // Destroy existing modules
    if (this.globalsFinder) {
      this.globalsFinder.destroy();
      this.globalsFinder = null;
    }
    
    if (this.streamMonitor) {
      this.streamMonitor.destroy();
      this.streamMonitor = null;
    }
    
    if (this.stateMonitor) {
      this.stateMonitor.destroy();
      this.stateMonitor = null;
    }
    
    // Clear DOM
    document.querySelectorAll('[id^="msRemAudio-"]').forEach(el => el.remove());
    
    // Reset globals
    window.appService = undefined;
    window.mediaSoupService = undefined;
    window.globals = undefined;
    
    // Update UI
    document.getElementById('topRoomDiv').innerHTML = 
      '<div style="color: #999; text-align: center;">Audio elements will appear here</div>';
    
    this.updateModuleStatus();
  }
  
  /**
   * Simulate VTF reconnect
   */
  simulateReconnect() {
    if (window.mediaSoupService?.reconnectAudio) {
      this.log('Triggering VTF reconnectAudio', 'info');
      window.mediaSoupService.reconnectAudio();
      this.updateModuleStatus();
    } else {
      this.log('MediaSoup service not available', 'error');
    }
  }
  
  /**
   * Add an audio element
   */
  addAudioElement() {
    const userId = `user${Date.now()}`;
    const element = this.createAudioElement(userId);
    this.log(`Added audio element: ${element.id}`, 'success');
    
    // Start monitoring if stream monitor exists
    if (this.streamMonitor) {
      this.streamMonitor.startMonitoring(element, userId, (stream) => {
        this.log(`Stream detected for ${userId}`, 'success');
        this.metrics.eventCounts.streamDetections++;
      });
    }
    
    return element;
  }
  
  /**
   * Remove an audio element
   */
  removeAudioElement() {
    const elements = document.querySelectorAll('[id^="msRemAudio-"]');
    if (elements.length > 0) {
      const element = elements[elements.length - 1];
      const userId = element.id;
      element.remove();
      this.log(`Removed audio element: ${userId}`, 'info');
    } else {
      this.log('No audio elements to remove', 'warning');
    }
  }
  
  /**
   * Change volume
   */
  changeVolume(value) {
    const volume = parseFloat(value);
    if (window.appService?.globals) {
      window.appService.globals.audioVolume = volume;
      this.log(`Changed volume to ${volume}`, 'info');
      this.metrics.eventCounts.volumeChanges++;
    } else {
      this.log('VTF globals not available', 'error');
    }
  }
  
  /**
   * Change session state
   */
  changeSessionState(state) {
    if (window.appService?.globals?.sessData) {
      window.appService.globals.sessData.currentState = state;
      this.log(`Changed session state to ${state}`, 'info');
      this.metrics.eventCounts.stateChanges++;
    } else {
      this.log('VTF globals not available', 'error');
    }
  }
  
  /**
   * Helper: Create audio element
   */
  createAudioElement(userId) {
    const audio = document.createElement('audio');
    audio.id = `msRemAudio-${userId}`;
    audio.className = 'audio-element';
    
    const container = document.getElementById('topRoomDiv');
    container.appendChild(audio);
    
    // Update visual representation
    const hasStream = !!audio.srcObject;
    audio.textContent = `${audio.id} ${hasStream ? '(stream)' : ''}`;
    if (hasStream) {
      audio.classList.add('has-stream');
    }
    
    return audio;
  }
  
  /**
   * Helper: Create mock MediaStream
   */
  createMockStream() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const destination = audioContext.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      
      // Stop after 100ms
      setTimeout(() => oscillator.stop(), 100);
      
      return destination.stream;
    } catch (e) {
      // Fallback mock
      return {
        active: true,
        id: 'mock-stream-' + Date.now(),
        getAudioTracks: () => [{
          readyState: 'live',
          muted: false,
          kind: 'audio',
          id: 'mock-track'
        }]
      };
    }
  }
  
  /**
   * Helper: Assert condition
   */
  assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }
  
  /**
   * Helper: Wait for milliseconds
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Helper: Log message
   */
  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `[${timestamp}] ${message}`;
    
    this.ui.log.appendChild(entry);
    this.ui.log.scrollTop = this.ui.log.scrollHeight;
    
    // Also log to console
    console.log(`[TestHarness] ${message}`);
  }
  
  /**
   * Helper: Add test result
   */
  addResult(id, name, status) {
    const result = document.createElement('span');
    result.id = id;
    result.className = `test-result test-${status}`;
    result.textContent = name;
    this.ui.results.appendChild(result);
  }
  
  /**
   * Helper: Update test result
   */
  updateResult(id, status) {
    const result = document.getElementById(id);
    if (result) {
      result.className = `test-result test-${status}`;
    }
  }
  
  /**
   * Helper: Clear results
   */
  clearResults() {
    this.ui.results.innerHTML = '';
    this.testResults.clear();
  }
  
  /**
   * Show test summary
   */
  showSummary() {
    const elapsed = Date.now() - this.metrics.startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = ((elapsed % 60000) / 1000).toFixed(1);
    
    this.log('\n📊 Test Summary:', 'info');
    this.log(`Total tests: ${this.metrics.testsRun}`, 'info');
    this.log(`Passed: ${this.metrics.testsPassed}`, 'success');
    this.log(`Failed: ${this.metrics.testsFailed}`, this.metrics.testsFailed > 0 ? 'error' : 'info');
    this.log(`Time: ${minutes}m ${seconds}s`, 'info');
    this.log(`Events: ${JSON.stringify(this.metrics.eventCounts)}`, 'info');
  }
}

// Create and export test harness instance
const testHarness = new VTFTestHarness();
window.testHarness = testHarness;

export { testHarness };