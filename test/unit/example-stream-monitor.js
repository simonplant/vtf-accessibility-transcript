/**
 * Usage examples for VTFStreamMonitor
 * Shows integration patterns and real-world usage
 */

import { VTFStreamMonitor } from './vtf-stream-monitor.js';

// Example 1: Basic usage with DOM monitoring
async function basicDOMIntegration() {
  console.log('--- Example 1: Basic DOM Integration ---');
  
  const streamMonitor = new VTFStreamMonitor({
    pollInterval: 50,
    maxPollTime: 10000  // 10 seconds max wait
  });
  
  // Set up mutation observer for VTF audio elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeName === 'AUDIO' && node.id?.startsWith('msRemAudio-')) {
          const userId = node.id.replace('msRemAudio-', '');
          console.log(`Detected new VTF audio element for user: ${userId}`);
          
          // Start monitoring for stream
          streamMonitor.startMonitoring(node, userId, async (stream) => {
            if (stream) {
              console.log(`Stream assigned to ${userId}, validating...`);
              
              try {
                await streamMonitor.waitForStreamReady(stream);
                console.log(`Stream ready for capture: ${userId}`);
                // Start audio capture here
              } catch (error) {
                console.error(`Stream validation failed for ${userId}:`, error);
              }
            } else {
              console.warn(`Timeout waiting for stream: ${userId}`);
            }
          });
        }
      });
    });
  });
  
  // Start observing
  const container = document.getElementById('topRoomDiv') || document.body;
  observer.observe(container, { childList: true, subtree: true });
  
  console.log('DOM observer active, waiting for audio elements...');
  
  // Simulate VTF element creation after 2 seconds
  setTimeout(() => {
    const mockAudio = document.createElement('audio');
    mockAudio.id = 'msRemAudio-demo123';
    container.appendChild(mockAudio);
    
    // Simulate stream assignment after another 1 second
    setTimeout(() => {
      try {
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        mockAudio.srcObject = dest.stream;
      } catch (e) {
        console.log('Could not create real stream for demo');
      }
    }, 1000);
  }, 2000);
  
  // Cleanup after 5 seconds
  setTimeout(() => {
    observer.disconnect();
    streamMonitor.destroy();
    console.log('Example 1 cleanup complete');
  }, 5000);
}

// Example 2: Handling multiple streams with different timing
async function multiStreamExample() {
  console.log('\n--- Example 2: Multiple Streams ---');
  
  const monitor = new VTFStreamMonitor({
    pollInterval: 25,
    enableDebugLogs: false
  });
  
  const users = ['alice', 'bob', 'charlie'];
  const captureStates = new Map();
  
  // Create audio elements
  users.forEach((user, index) => {
    const audio = document.createElement('audio');
    audio.id = `msRemAudio-${user}`;
    document.body.appendChild(audio);
    
    // Monitor each element
    monitor.startMonitoring(audio, user, async (stream) => {
      if (stream) {
        console.log(`[${user}] Stream detected, starting capture...`);
        captureStates.set(user, 'capturing');
        
        // Simulate capture process
        await new Promise(resolve => setTimeout(resolve, 500));
        captureStates.set(user, 'active');
        console.log(`[${user}] Capture active`);
      } else {
        console.log(`[${user}] No stream detected (timeout)`);
        captureStates.set(user, 'failed');
      }
    });
    
    // Simulate streams arriving at different times
    setTimeout(() => {
      try {
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        audio.srcObject = dest.stream;
      } catch (e) {
        console.log(`Could not create stream for ${user}`);
      }
    }, (index + 1) * 1000);
  });
  
  // Monitor status
  const statusInterval = setInterval(() => {
    console.log('Active monitors:', monitor.getMonitorCount());
    console.log('Capture states:', Object.fromEntries(captureStates));
  }, 1000);
  
  // Cleanup after 5 seconds
  setTimeout(() => {
    clearInterval(statusInterval);
    users.forEach(user => {
      const audio = document.getElementById(`msRemAudio-${user}`);
      if (audio) audio.remove();
    });
    monitor.destroy();
    console.log('Example 2 cleanup complete');
  }, 5000);
}

// Example 3: Error handling and recovery
async function errorHandlingExample() {
  console.log('\n--- Example 3: Error Handling ---');
  
  const monitor = new VTFStreamMonitor({
    pollInterval: 100,
    maxPollTime: 2000  // Short timeout for demo
  });
  
  // Scenario 1: Element removed during monitoring
  const audio1 = document.createElement('audio');
  audio1.id = 'msRemAudio-removed';
  document.body.appendChild(audio1);
  
  monitor.startMonitoring(audio1, 'removed-user', (stream) => {
    console.log('This callback should not fire (element removed)');
  });
  
  setTimeout(() => {
    audio1.remove();
    console.log('Removed audio element during monitoring');
  }, 500);
  
  // Scenario 2: Stream becomes inactive
  const audio2 = document.createElement('audio');
  audio2.id = 'msRemAudio-inactive';
  document.body.appendChild(audio2);
  
  try {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const oscillator = ctx.createOscillator();
    oscillator.connect(dest);
    oscillator.start();
    
    audio2.srcObject = dest.stream;
    
    monitor.startMonitoring(audio2, 'inactive-user', async (stream) => {
      if (stream) {
        console.log('Stream detected, stopping audio track...');
        
        // Stop the track to make stream inactive
        stream.getAudioTracks()[0].stop();
        
        try {
          await monitor.waitForStreamReady(stream);
        } catch (error) {
          console.log('Expected error:', error.message);
        }
      }
    });
  } catch (e) {
    console.log('Could not create audio context for demo');
  }
  
  // Cleanup after 3 seconds
  setTimeout(() => {
    document.getElementById('msRemAudio-inactive')?.remove();
    monitor.destroy();
    console.log('Example 3 cleanup complete');
  }, 3000);
}

// Example 4: Performance monitoring
async function performanceExample() {
  console.log('\n--- Example 4: Performance Monitoring ---');
  
  const monitor = new VTFStreamMonitor({
    pollInterval: 10,  // Fast polling for stress test
    maxPollTime: 5000
  });
  
  const startTime = Date.now();
  const elementCount = 20;
  
  // Create many elements
  console.log(`Creating ${elementCount} monitors...`);
  
  for (let i = 0; i < elementCount; i++) {
    const audio = document.createElement('audio');
    audio.id = `msRemAudio-perf${i}`;
    document.body.appendChild(audio);
    
    monitor.startMonitoring(audio, `perf${i}`, (stream) => {
      // Just count detections
    });
    
    // Assign streams with random delay
    setTimeout(() => {
      try {
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        audio.srcObject = dest.stream;
      } catch (e) {
        // Silent fail
      }
    }, Math.random() * 2000);
  }
  
  // Monitor performance
  const perfInterval = setInterval(() => {
    const debug = monitor.debug();
    console.log('Performance stats:', {
      activeMonitors: debug.monitorCount,
      succeeded: debug.stats.monitorsSucceeded,
      failed: debug.stats.monitorsFailed,
      avgDetectionTime: debug.averageDetectionTime + 'ms'
    });
  }, 500);
  
  // Cleanup after 3 seconds
  setTimeout(() => {
    clearInterval(perfInterval);
    
    const elapsed = Date.now() - startTime;
    const debug = monitor.debug();
    
    console.log('\nFinal performance report:');
    console.log(`Total time: ${elapsed}ms`);
    console.log(`Monitors started: ${debug.stats.monitorsStarted}`);
    console.log(`Success rate: ${(debug.stats.monitorsSucceeded / debug.stats.monitorsStarted * 100).toFixed(1)}%`);
    console.log(`Average detection time: ${debug.averageDetectionTime}ms`);
    
    // Remove all elements
    for (let i = 0; i < elementCount; i++) {
      document.getElementById(`msRemAudio-perf${i}`)?.remove();
    }
    
    monitor.destroy();
    console.log('Example 4 cleanup complete');
  }, 3000);
}

// Example 5: Integration with VTF patterns
async function vtfIntegrationExample() {
  console.log('\n--- Example 5: VTF Integration Pattern ---');
  
  class VTFAudioManager {
    constructor() {
      this.streamMonitor = new VTFStreamMonitor();
      this.activeCaptures = new Map();
    }
    
    handleNewAudioElement(element) {
      const userId = element.id.replace('msRemAudio-', '');
      console.log(`[VTF Manager] New audio element: ${userId}`);
      
      this.streamMonitor.startMonitoring(element, userId, async (stream) => {
        await this.handleStreamAssigned(userId, stream, element);
      });
    }
    
    async handleStreamAssigned(userId, stream, element) {
      if (!stream) {
        console.warn(`[VTF Manager] Stream timeout for ${userId}`);
        this.handleUserDisconnect(userId);
        return;
      }
      
      try {
        // Validate stream is ready
        await this.streamMonitor.waitForStreamReady(stream);
        
        console.log(`[VTF Manager] Starting capture for ${userId}`);
        
        // Store capture info
        this.activeCaptures.set(userId, {
          element,
          stream,
          startTime: Date.now()
        });
        
        // In real implementation, start audio processing here
        
      } catch (error) {
        console.error(`[VTF Manager] Failed to start capture for ${userId}:`, error);
        this.handleUserDisconnect(userId);
      }
    }
    
    handleUserDisconnect(userId) {
      console.log(`[VTF Manager] Handling disconnect for ${userId}`);
      this.streamMonitor.stopMonitoring(userId);
      this.activeCaptures.delete(userId);
    }
    
    handleReconnectAudio() {
      console.log('[VTF Manager] VTF reconnectAudio called - resetting all');
      
      // Stop all monitoring
      this.streamMonitor.stopAll();
      
      // Clear captures
      this.activeCaptures.clear();
      
      // Re-scan DOM for audio elements
      const audioElements = document.querySelectorAll('audio[id^="msRemAudio-"]');
      audioElements.forEach(element => {
        this.handleNewAudioElement(element);
      });
    }
    
    getStatus() {
      return {
        monitoring: this.streamMonitor.getMonitorCount(),
        capturing: this.activeCaptures.size,
        debug: this.streamMonitor.debug()
      };
    }
    
    destroy() {
      this.streamMonitor.destroy();
      this.activeCaptures.clear();
    }
  }
  
  // Demo the manager
  const manager = new VTFAudioManager();
  
  // Simulate VTF audio element
  const audio = document.createElement('audio');
  audio.id = 'msRemAudio-vtfdemo';
  document.body.appendChild(audio);
  
  manager.handleNewAudioElement(audio);
  
  // Simulate stream after 1 second
  setTimeout(() => {
    try {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      audio.srcObject = dest.stream;
    } catch (e) {
      console.log('Could not create stream');
    }
  }, 1000);
  
  // Simulate reconnect after 2 seconds
  setTimeout(() => {
    manager.handleReconnectAudio();
    console.log('Status after reconnect:', manager.getStatus());
  }, 2000);
  
  // Cleanup after 3 seconds
  setTimeout(() => {
    audio.remove();
    manager.destroy();
    console.log('Example 5 cleanup complete');
  }, 3000);
}

// Run all examples
async function runExamples() {
  console.log('🚀 VTFStreamMonitor Usage Examples\n');
  
  await basicDOMIntegration();
  await new Promise(resolve => setTimeout(resolve, 6000));
  
  await multiStreamExample();
  await new Promise(resolve => setTimeout(resolve, 6000));
  
  await errorHandlingExample();
  await new Promise(resolve => setTimeout(resolve, 4000));
  
  await performanceExample();
  await new Promise(resolve => setTimeout(resolve, 4000));
  
  await vtfIntegrationExample();
  
  console.log('\n✨ All examples completed!');
}

// Export examples
export {
  basicDOMIntegration,
  multiStreamExample,
  errorHandlingExample,
  performanceExample,
  vtfIntegrationExample,
  runExamples
};

// Auto-run if accessed directly
if (typeof window !== 'undefined' && window.location.href.includes('example')) {
  runExamples();
} 