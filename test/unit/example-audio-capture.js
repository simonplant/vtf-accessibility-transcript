/**
 * Usage examples for VTFAudioCapture
 * Shows integration with VTFStreamMonitor and real-world patterns
 */

import { VTFAudioCapture } from '../../src/modules/vtf-audio-capture.js';
import { VTFStreamMonitor } from '../../src/modules/vtf-stream-monitor.js';

// Example 1: Basic integration with VTFStreamMonitor
async function basicStreamMonitorIntegration() {
  console.log('--- Example 1: Stream Monitor Integration ---');
  
  const audioCapture = new VTFAudioCapture();
  const streamMonitor = new VTFStreamMonitor();
  
  await audioCapture.initialize();
  console.log('Audio capture initialized');
  
  // Monitor DOM for VTF audio elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeName === 'AUDIO' && node.id?.startsWith('msRemAudio-')) {
          const userId = node.id.replace('msRemAudio-', '');
          console.log(`Found VTF audio element for ${userId}`);
          
          // Start monitoring for stream
          streamMonitor.startMonitoring(node, userId, async (stream) => {
            if (stream) {
              console.log(`Stream detected for ${userId}, starting capture`);
              try {
                await audioCapture.captureElement(node, stream, userId);
                console.log(`Capture active for ${userId}`);
              } catch (error) {
                console.error(`Failed to capture ${userId}:`, error);
              }
            } else {
              console.log(`Stream monitoring timeout for ${userId}`);
            }
          });
        }
      });
      
      // Handle removed elements
      mutation.removedNodes.forEach((node) => {
        if (node.nodeName === 'AUDIO' && node.id?.startsWith('msRemAudio-')) {
          const userId = node.id.replace('msRemAudio-', '');
          console.log(`VTF audio element removed for ${userId}`);
          audioCapture.stopCapture(userId);
        }
      });
    });
  });
  
  // Start observing
  const container = document.getElementById('topRoomDiv') || document.body;
  observer.observe(container, { childList: true, subtree: true });
  
  console.log('Monitoring for VTF audio elements...');
  
  return { audioCapture, streamMonitor, observer };
}

// Example 2: Volume synchronization with VTF
async function volumeSyncExample() {
  console.log('\n--- Example 2: Volume Synchronization ---');
  
  // Set up mock VTF environment
  window.appService = {
    globals: {
      audioVolume: 0.8
    }
  };
  
  const audioCapture = new VTFAudioCapture();
  await audioCapture.initialize();
  
  console.log('Initial VTF volume:', audioCapture.getVTFVolume());
  
  // Create test capture
  const element = document.createElement('audio');
  element.id = 'msRemAudio-volumeTest';
  document.body.appendChild(element);
  
  const stream = await createTestStream();
  await audioCapture.captureElement(element, stream, 'volumeTest');
  
  // Simulate VTF volume changes
  console.log('Simulating VTF volume changes...');
  
  setTimeout(() => {
    window.appService.globals.audioVolume = 0.5;
    console.log('VTF volume changed to 0.5');
  }, 1000);
  
  setTimeout(() => {
    window.appService.globals.audioVolume = 0.0;
    console.log('VTF muted');
  }, 2000);
  
  setTimeout(() => {
    window.appService.globals.audioVolume = 1.0;
    console.log('VTF volume maxed');
  }, 3000);
  
  // Monitor volume updates
  setInterval(() => {
    const stats = audioCapture.getAllStats();
    console.log('Current capture volume:', stats.currentVolume);
  }, 500);
  
  return audioCapture;
}

// Example 3: Handling VTF reconnection
async function reconnectionHandling() {
  console.log('\n--- Example 3: VTF Reconnection Handling ---');
  
  const audioCapture = new VTFAudioCapture();
  await audioCapture.initialize();
  
  const activeUsers = new Map();
  
  // Function to handle user audio
  async function handleUserAudio(userId, element, stream) {
    console.log(`Setting up audio for ${userId}`);
    
    try {
      await audioCapture.captureElement(element, stream, userId);
      activeUsers.set(userId, { element, stream });
    } catch (error) {
      console.error(`Failed to setup ${userId}:`, error);
    }
  }
  
  // Simulate reconnectAudio behavior
  async function simulateReconnect() {
    console.log('VTF reconnectAudio called - stopping all captures');
    
    // Stop all captures
    const stopped = audioCapture.stopAll();
    console.log(`Stopped ${stopped} captures`);
    
    // Clear DOM (VTF pattern)
    document.querySelectorAll('[id^="msRemAudio-"]').forEach(el => el.remove());
    
    // Recreate after delay
    setTimeout(async () => {
      console.log('Recreating audio elements');
      
      for (const [userId, data] of activeUsers) {
        const newElement = document.createElement('audio');
        newElement.id = `msRemAudio-${userId}`;
        document.body.appendChild(newElement);
        
        // Reassign stream
        newElement.srcObject = data.stream;
        
        // Restart capture
        await handleUserAudio(userId, newElement, data.stream);
      }
    }, 1000);
  }
  
  // Add some test users
  for (let i = 0; i < 3; i++) {
    const userId = `user${i}`;
    const element = document.createElement('audio');
    element.id = `msRemAudio-${userId}`;
    document.body.appendChild(element);
    
    const stream = await createTestStream();
    element.srcObject = stream;
    
    await handleUserAudio(userId, element, stream);
  }
  
  console.log('Active captures:', audioCapture.getCaptureCount());
  
  // Simulate reconnect after 2 seconds
  setTimeout(() => simulateReconnect(), 2000);
  
  return { audioCapture, simulateReconnect };
}

// Example 4: Performance monitoring
async function performanceMonitoring() {
  console.log('\n--- Example 4: Performance Monitoring ---');
  
  const audioCapture = new VTFAudioCapture({
    bufferSize: 8192  // Larger buffers for performance test
  });
  
  await audioCapture.initialize();
  
  const performanceStats = {
    capturesPerSecond: [],
    activeCaptures: [],
    processingLoad: []
  };
  
  // Monitor performance metrics
  const monitorInterval = setInterval(() => {
    const stats = audioCapture.getAllStats();
    
    performanceStats.activeCaptures.push(stats.activeCaptures);
    
    // Calculate captures per second
    if (performanceStats.capturesPerSecond.length > 0) {
      const lastStats = performanceStats.capturesPerSecond[performanceStats.capturesPerSecond.length - 1];
      const capturesPerSec = stats.capturesStarted - lastStats.total;
      performanceStats.capturesPerSecond.push({
        total: stats.capturesStarted,
        perSecond: capturesPerSec
      });
    } else {
      performanceStats.capturesPerSecond.push({
        total: stats.capturesStarted,
        perSecond: 0
      });
    }
    
    // Log summary
    console.log('Performance:', {
      active: stats.activeCaptures,
      worklet: stats.workletUsed,
      fallback: stats.fallbackUsed,
      errors: stats.errors
    });
  }, 1000);
  
  // Simulate load
  async function simulateLoad() {
    for (let i = 0; i < 5; i++) {
      const element = document.createElement('audio');
      element.id = `msRemAudio-perf${i}`;
      document.body.appendChild(element);
      
      const stream = await createTestStream();
      await audioCapture.captureElement(element, stream, `perf${i}`);
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  await simulateLoad();
  
  return { audioCapture, performanceStats, stopMonitoring: () => clearInterval(monitorInterval) };
}

// Example 5: Error recovery patterns
async function errorRecoveryPatterns() {
  console.log('\n--- Example 5: Error Recovery Patterns ---');
  
  const audioCapture = new VTFAudioCapture();
  await audioCapture.initialize();
  
  // Pattern 1: Handle missing audio tracks
  console.log('Test 1: Missing audio tracks');
  try {
    const element = document.createElement('audio');
    const emptyStream = new MediaStream(); // No tracks
    await audioCapture.captureElement(element, emptyStream, 'noTracks');
  } catch (error) {
    console.log('Correctly caught:', error.message);
  }
  
  // Pattern 2: Handle track ending
  console.log('\nTest 2: Track ending');
  const element2 = document.createElement('audio');
  const stream2 = await createTestStream();
  await audioCapture.captureElement(element2, stream2, 'endingTrack');
  
  // Simulate track ending
  const track = stream2.getAudioTracks()[0];
  if (track.stop) {
    track.stop();
    console.log('Track stopped');
  }
  
  // Pattern 3: Context suspension
  console.log('\nTest 3: Context suspension handling');
  if (audioCapture.audioContext.suspend) {
    await audioCapture.audioContext.suspend();
    console.log('Context suspended:', audioCapture.audioContext.state);
    
    await audioCapture.audioContext.resume();
    console.log('Context resumed:', audioCapture.audioContext.state);
  }
  
  // Pattern 4: Graceful degradation
  console.log('\nTest 4: Worklet fallback');
  const fallbackCapture = new VTFAudioCapture();
  fallbackCapture.workletReady = false; // Force fallback
  await fallbackCapture.initialize();
  
  const element4 = document.createElement('audio');
  const stream4 = await createTestStream();
  await fallbackCapture.captureElement(element4, stream4, 'fallback');
  
  const stats = fallbackCapture.getCaptureStats('fallback');
  console.log('Using processor:', stats.processorType);
  
  // Cleanup
  audioCapture.destroy();
  fallbackCapture.destroy();
}

// Helper: Create test audio stream
async function createTestStream() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    const destination = context.createMediaStreamDestination();
    
    oscillator.frequency.value = 440;
    gainNode.gain.value = 0.1;
    
    oscillator.connect(gainNode);
    gainNode.connect(destination);
    oscillator.start();
    
    return destination.stream;
  } catch (e) {
    // Return mock stream
    return {
      id: 'mock-stream',
      active: true,
      getAudioTracks: () => [{
        kind: 'audio',
        readyState: 'live',
        muted: false,
        stop: () => {}
      }]
    };
  }
}

// Run all examples
async function runExamples() {
  console.log('🚀 VTFAudioCapture Usage Examples\n');
  
  const example1 = await basicStreamMonitorIntegration();
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const example2 = await volumeSyncExample();
  
  await new Promise(resolve => setTimeout(resolve, 4000));
  
  const example3 = await reconnectionHandling();
  
  await new Promise(resolve => setTimeout(resolve, 4000));
  
  const example4 = await performanceMonitoring();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  example4.stopMonitoring();
  
  await errorRecoveryPatterns();
  
  console.log('\n✨ Examples completed!');
  
  // Cleanup
  example1.audioCapture.destroy();
  example2.destroy();
  example3.audioCapture.destroy();
  example4.audioCapture.destroy();
}

// Export examples
export {
  basicStreamMonitorIntegration,
  volumeSyncExample,
  reconnectionHandling,
  performanceMonitoring,
  errorRecoveryPatterns,
  runExamples
};

// Auto-run if accessed directly
if (typeof window !== 'undefined' && window.location.href.includes('example')) {
  runExamples();
}