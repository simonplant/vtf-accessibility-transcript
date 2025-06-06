/**
 * Usage examples for VTFGlobalsFinder
 * Shows how to integrate with other modules and handle various scenarios
 */

import { VTFGlobalsFinder } from './vtf-globals-finder.js';

// Example 1: Basic usage in content script
async function basicUsage() {
  console.log('--- Example 1: Basic Usage ---');
  
  const finder = new VTFGlobalsFinder();
  
  // Wait for globals with default settings
  const found = await finder.waitForGlobals();
  
  if (found) {
    console.log('VTF globals found!');
    console.log('Audio volume:', finder.globals.audioVolume);
    console.log('Session state:', finder.globals.sessData?.currentState);
    
    // Access MediaSoup service if available
    if (finder.mediaSoupService) {
      console.log('MediaSoup service available');
    }
  } else {
    console.error('VTF globals not found - page might not be VTF');
  }
  
  // Clean up when done
  finder.destroy();
}

// Example 2: Custom timeout and interval
async function customTimingUsage() {
  console.log('\n--- Example 2: Custom Timing ---');
  
  const finder = new VTFGlobalsFinder({
    defaultInterval: 250,  // Check every 250ms
    defaultMaxRetries: 120 // Wait up to 30 seconds
  });
  
  // Or override in the method call
  const found = await finder.waitForGlobals(20, 1000); // 20 retries, 1 second each
  
  console.log('Search result:', found);
  console.log('Search took:', finder.searchCount, 'attempts');
  
  finder.destroy();
}

// Example 3: Integration with other modules via callbacks
class VTFExtensionCore {
  constructor() {
    this.globalsFinder = new VTFGlobalsFinder();
    this.ready = false;
  }
  
  async initialize() {
    console.log('\n--- Example 3: Module Integration ---');
    
    // Wait for globals
    const found = await this.globalsFinder.waitForGlobals();
    
    if (!found) {
      throw new Error('Failed to initialize: VTF globals not found');
    }
    
    this.ready = true;
    
    // Pass globals to other modules
    this.initializeAudioCapture();
    this.initializeStateMonitor();
    
    return true;
  }
  
  initializeAudioCapture() {
    // Example: Pass volume to audio module
    const volume = this.globalsFinder.globals.audioVolume;
    console.log('Initializing audio capture with volume:', volume);
    
    // AudioCaptureModule.initialize({ initialVolume: volume });
  }
  
  initializeStateMonitor() {
    // Example: Set up state monitoring
    const sessionState = this.globalsFinder.globals.sessData?.currentState;
    console.log('Initializing state monitor with session:', sessionState);
    
    // StateMonitor.initialize({ sessionState });
  }
  
  destroy() {
    this.globalsFinder.destroy();
  }
}

// Example 4: Error handling and retry logic
async function robustInitialization() {
  console.log('\n--- Example 4: Robust Initialization ---');
  
  let finder = null;
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`Initialization attempt ${attempts}/${maxAttempts}`);
      
      finder = new VTFGlobalsFinder();
      const found = await finder.waitForGlobals(30, 500); // 15 second timeout
      
      if (found) {
        console.log('Successfully initialized!');
        break;
      } else {
        console.warn('Globals not found, retrying...');
        finder.destroy();
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error('Initialization error:', error);
      if (finder) finder.destroy();
    }
  }
  
  if (finder && finder.globals) {
    console.log('Ready to use VTF extension');
    // Proceed with extension functionality
  } else {
    console.error('Failed to initialize after', maxAttempts, 'attempts');
    // Show user error message
  }
  
  if (finder) finder.destroy();
}

// Example 5: Monitoring globals changes
function monitorGlobalsChanges() {
  console.log('\n--- Example 5: Monitoring Changes ---');
  
  const finder = new VTFGlobalsFinder();
  
  // Quick sync check
  if (!finder.findGlobals()) {
    console.log('Globals not immediately available');
    return;
  }
  
  let lastVolume = finder.globals.audioVolume;
  
  // Monitor for changes
  const checkInterval = setInterval(() => {
    if (finder.globals) {
      const currentVolume = finder.globals.audioVolume;
      
      if (currentVolume !== lastVolume) {
        console.log('Volume changed:', lastVolume, '→', currentVolume);
        lastVolume = currentVolume;
        
        // Notify other modules of volume change
        // EventBus.emit('volumeChanged', currentVolume);
      }
    }
  }, 1000);
  
  // Clean up after 30 seconds for this example
  setTimeout(() => {
    clearInterval(checkInterval);
    finder.destroy();
    console.log('Monitoring stopped');
  }, 30000);
}

// Example 6: Debug and diagnostics
async function debugDiagnostics() {
  console.log('\n--- Example 6: Debug Diagnostics ---');
  
  const finder = new VTFGlobalsFinder();
  
  // Check immediately
  const immediate = finder.findGlobals();
  console.log('Immediate check:', immediate);
  console.log('Initial debug state:', finder.debug());
  
  // Try async wait
  console.log('\nStarting async search...');
  const found = await finder.waitForGlobals(10, 1000);
  
  // Full debug output
  console.log('\nFinal debug state:', finder.debug());
  
  // Manual service check
  if (found) {
    console.log('\nAvailable services:');
    console.log('- MediaSoup:', !!finder.mediaSoupService);
    console.log('- App Service:', !!finder.appService);
    console.log('- Alerts Service:', !!finder.alertsService);
  }
  
  finder.destroy();
}

// Run examples based on URL parameter or all
async function runExamples() {
  const params = new URLSearchParams(window.location.search);
  const example = params.get('example');
  
  console.log('🚀 VTFGlobalsFinder Usage Examples\n');
  
  if (!example || example === '1') await basicUsage();
  if (!example || example === '2') await customTimingUsage();
  if (!example || example === '3') {
    const core = new VTFExtensionCore();
    try {
      await core.initialize();
    } catch (e) {
      console.error(e);
    }
    core.destroy();
  }
  if (!example || example === '4') await robustInitialization();
  if (!example || example === '5') monitorGlobalsChanges();
  if (!example || example === '6') await debugDiagnostics();
  
  console.log('\n✨ Examples completed!');
}

// Export for use in other modules
export { 
  basicUsage,
  customTimingUsage,
  VTFExtensionCore,
  robustInitialization,
  monitorGlobalsChanges,
  debugDiagnostics,
  runExamples
};

// Auto-run if accessed directly
if (typeof window !== 'undefined' && window.location.href.includes('example')) {
  runExamples();
}