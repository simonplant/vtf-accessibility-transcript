/**
 * Usage examples for AudioDataTransfer
 * Shows integration patterns with VTFAudioCapture and service worker
 */

import { AudioDataTransfer } from '../../src/modules/audio-data-transfer.js';
import { VTFAudioCapture } from '../../src/modules/vtf-audio-capture.js';

// Example 1: Basic integration with VTFAudioCapture
async function basicAudioCaptureIntegration() {
  console.log('--- Example 1: Audio Capture Integration ---');
  
  // Create instances
  const audioCapture = new VTFAudioCapture();
  const dataTransfer = new AudioDataTransfer();
  
  // Replace the stub in VTFAudioCapture
  audioCapture.dataTransfer = dataTransfer;
  
  // Override handleAudioData to use real transfer
  const originalHandle = audioCapture.handleAudioData.bind(audioCapture);
  audioCapture.handleAudioData = function(userId, data) {
    // Call original for stats
    originalHandle(userId, data);
    
    // Send via data transfer
    dataTransfer.sendAudioData(userId, data.samples);
  };
  
  await audioCapture.initialize();
  console.log('Audio capture initialized with data transfer');
  
  // Monitor transfer stats
  const statsInterval = setInterval(() => {
    const stats = dataTransfer.getStats();
    console.log('Transfer stats:', {
      sent: stats.chunksSent,
      pending: stats.pendingUsers,
      errors: stats.errors
    });
  }, 5000);
  
  // Clean shutdown handler
  const cleanup = () => {
    clearInterval(statsInterval);
    dataTransfer.flushAll();
    dataTransfer.destroy();
    audioCapture.destroy();
  };
  
  // Handle page unload
  window.addEventListener('beforeunload', cleanup);
  
  return { audioCapture, dataTransfer, cleanup };
}

// Example 2: Adaptive chunking based on network conditions
async function adaptiveChunking() {
  console.log('\n--- Example 2: Adaptive Chunking ---');
  
  const dataTransfer = new AudioDataTransfer();
  
  // Network condition simulator
  let networkQuality = 'good'; // 'good', 'medium', 'poor'
  let sendLatency = 0;
  
  // Monitor send performance
  const originalSendChunk = dataTransfer.sendChunk.bind(dataTransfer);
  dataTransfer.sendChunk = function(userId, chunk, retryCount) {
    const startTime = Date.now();
    
    // Simulate network delay
    setTimeout(() => {
      originalSendChunk(userId, chunk, retryCount);
      sendLatency = Date.now() - startTime;
      
      // Adapt chunk size based on latency
      if (sendLatency > 1000 && networkQuality !== 'poor') {
        networkQuality = 'poor';
        dataTransfer.setChunkSize(8192); // Smaller chunks
        console.log('Network poor - reduced chunk size to 8192');
      } else if (sendLatency < 100 && networkQuality !== 'good') {
        networkQuality = 'good';
        dataTransfer.setChunkSize(32768); // Larger chunks
        console.log('Network good - increased chunk size to 32768');
      }
    }, Math.random() * sendLatency);
  };
  
  // Simulate varying network conditions
  setInterval(() => {
    // Random network quality
    sendLatency = networkQuality === 'good' ? 50 : 
                 networkQuality === 'medium' ? 500 : 
                 2000;
    sendLatency += Math.random() * 100;
  }, 5000);
  
  return dataTransfer;
}

// Example 3: Multi-user conference handling
async function multiUserConference() {
  console.log('\n--- Example 3: Multi-User Conference ---');
  
  const dataTransfer = new AudioDataTransfer({
    chunkSize: 16384,
    maxPendingSize: 163840 // 10 seconds per user
  });
  
  // Track active users
  const activeUsers = new Map();
  
  // User management functions
  const conference = {
    addUser(userId, userName) {
      console.log(`User joined: ${userName} (${userId})`);
      activeUsers.set(userId, {
        name: userName,
        joinTime: Date.now(),
        audioActivity: 0
      });
    },
    
    removeUser(userId) {
      const user = activeUsers.get(userId);
      if (user) {
        console.log(`User left: ${user.name}`);
        
        // Flush any pending audio
        dataTransfer.flush(userId);
        activeUsers.delete(userId);
      }
    },
    
    processAudio(userId, audioData) {
      const user = activeUsers.get(userId);
      if (!user) return;
      
      // Update activity
      user.audioActivity++;
      
      // Send audio
      dataTransfer.sendAudioData(userId, audioData);
    },
    
    getStats() {
      const userStats = [];
      
      for (const [userId, user] of activeUsers) {
        const transferStats = dataTransfer.getUserStats(userId);
        userStats.push({
          name: user.name,
          duration: (Date.now() - user.joinTime) / 1000,
          audioActivity: user.audioActivity,
          secondsSent: transferStats ? transferStats.secondsSent : 0
        });
      }
      
      return {
        activeUsers: activeUsers.size,
        users: userStats,
        transfer: dataTransfer.getStats()
      };
    }
  };
  
  // Simulate conference activity
  conference.addUser('user1', 'Alice');
  conference.addUser('user2', 'Bob');
  conference.addUser('user3', 'Charlie');
  
  // Periodic stats display
  setInterval(() => {
    const stats = conference.getStats();
    console.log('Conference stats:', {
      users: stats.activeUsers,
      totalChunks: stats.transfer.chunksSent,
      totalMB: (stats.transfer.bytesSent / 1024 / 1024).toFixed(2)
    });
  }, 10000);
  
  return { dataTransfer, conference };
}

// Example 4: Error recovery and resilience
async function errorRecoveryExample() {
  console.log('\n--- Example 4: Error Recovery ---');
  
  const dataTransfer = new AudioDataTransfer({
    retryAttempts: 3,
    retryDelay: 1000
  });
  
  // Simulate extension context issues
  let extensionHealthy = true;
  
  // Override chrome.runtime periodically
  const originalChrome = window.chrome;
  
  setInterval(() => {
    if (Math.random() < 0.1) { // 10% chance of failure
      extensionHealthy = false;
      window.chrome = undefined;
      console.log('⚠️ Extension context lost!');
      
      // Restore after 3 seconds
      setTimeout(() => {
        window.chrome = originalChrome;
        extensionHealthy = true;
        console.log('✅ Extension context restored');
        
        // Retry failed chunks
        dataTransfer.flushAll();
      }, 3000);
    }
  }, 5000);
  
  // Monitor failed chunks
  setInterval(() => {
    const stats = dataTransfer.getStats();
    if (stats.failedChunks > 0) {
      console.log(`⏳ ${stats.failedChunks} chunks waiting for retry`);
    }
  }, 2000);
  
  return dataTransfer;
}

// Example 5: Performance monitoring dashboard
async function performanceDashboard() {
  console.log('\n--- Example 5: Performance Dashboard ---');
  
  const dataTransfer = new AudioDataTransfer();
  
  // Performance metrics
  const metrics = {
    chunksPerSecond: [],
    bytesPerSecond: [],
    errorRate: [],
    pendingBytes: []
  };
  
  let lastStats = dataTransfer.getStats();
  let lastTime = Date.now();
  
  // Update metrics every second
  const metricsInterval = setInterval(() => {
    const currentStats = dataTransfer.getStats();
    const currentTime = Date.now();
    const deltaTime = (currentTime - lastTime) / 1000;
    
    // Calculate rates
    const chunksPerSec = (currentStats.chunksSent - lastStats.chunksSent) / deltaTime;
    const bytesPerSec = (currentStats.bytesSent - lastStats.bytesSent) / deltaTime;
    const errorRate = currentStats.errors / Math.max(1, currentStats.chunksSent);
    
    // Update metrics
    metrics.chunksPerSecond.push(chunksPerSec);
    metrics.bytesPerSecond.push(bytesPerSec);
    metrics.errorRate.push(errorRate);
    metrics.pendingBytes.push(currentStats.pendingBytes);
    
    // Keep last 60 seconds
    if (metrics.chunksPerSecond.length > 60) {
      metrics.chunksPerSecond.shift();
      metrics.bytesPerSecond.shift();
      metrics.errorRate.shift();
      metrics.pendingBytes.shift();
    }
    
    // Display summary
    console.log('📊 Performance:', {
      avgChunksPerSec: (metrics.chunksPerSecond.reduce((a, b) => a + b, 0) / metrics.chunksPerSecond.length).toFixed(2),
      avgKBPerSec: (metrics.bytesPerSecond.reduce((a, b) => a + b, 0) / metrics.bytesPerSecond.length / 1024).toFixed(2),
      errorRate: (errorRate * 100).toFixed(1) + '%',
      pendingKB: (currentStats.pendingBytes / 1024).toFixed(2)
    });
    
    lastStats = currentStats;
    lastTime = currentTime;
  }, 1000);
  
  // Debug info every 10 seconds
  setInterval(() => {
    console.log('🔍 Debug info:', dataTransfer.debug());
  }, 10000);
  
  return {
    dataTransfer,
    metrics,
    stop: () => clearInterval(metricsInterval)
  };
}

// Example 6: Complete VTF integration scenario
async function completeVTFIntegration() {
  console.log('\n--- Example 6: Complete VTF Integration ---');
  
  // Set up mock Chrome runtime
  window.chrome = {
    runtime: {
      id: 'vtf-audio-extension',
      sendMessage: (message, callback) => {
        console.log(`[Background] Received ${message.type} for ${message.userId}`);
        // Simulate processing delay
        setTimeout(() => {
          if (callback) callback({ processed: true });
        }, 50);
      },
      lastError: null
    }
  };
  
  // Create all components
  const audioCapture = new VTFAudioCapture();
  const dataTransfer = new AudioDataTransfer();
  
  // Wire up data transfer
  audioCapture.dataTransfer = dataTransfer;
  audioCapture.handleAudioData = function(userId, data) {
    this.captures.get(userId).sampleCount += data.samples.length;
    this.captures.get(userId).chunkCount++;
    dataTransfer.sendAudioData(userId, data.samples);
  };
  
  await audioCapture.initialize();
  
  // Simulate VTF audio elements
  async function simulateVTFUser(userId, duration = 10000) {
    const element = document.createElement('audio');
    element.id = `msRemAudio-${userId}`;
    document.body.appendChild(element);
    
    // Create mock stream
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const destination = ctx.createMediaStreamDestination();
    
    oscillator.frequency.value = 200 + Math.random() * 800;
    gain.gain.value = 0.3;
    
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start();
    
    // Start capture
    await audioCapture.captureElement(element, destination.stream, userId);
    
    // Stop after duration
    setTimeout(() => {
      oscillator.stop();
      audioCapture.stopCapture(userId);
      element.remove();
      ctx.close();
    }, duration);
  }
  
  // Add users over time
  simulateVTFUser('alice', 15000);
  setTimeout(() => simulateVTFUser('bob', 12000), 2000);
  setTimeout(() => simulateVTFUser('charlie', 10000), 4000);
  
  // Monitor everything
  const monitorInterval = setInterval(() => {
    console.log('\n📈 System Status:');
    console.log('Audio Capture:', audioCapture.getAllStats());
    console.log('Data Transfer:', dataTransfer.getStats());
  }, 3000);
  
  // Cleanup function
  const cleanup = () => {
    clearInterval(monitorInterval);
    dataTransfer.destroy();
    audioCapture.destroy();
  };
  
  // Auto cleanup after 20 seconds
  setTimeout(cleanup, 20000);
  
  return { audioCapture, dataTransfer, cleanup };
}

// Run all examples
async function runExamples() {
  console.log('🚀 AudioDataTransfer Usage Examples\n');
  
  const example1 = await basicAudioCaptureIntegration();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const example2 = await adaptiveChunking();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const example3 = await multiUserConference();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const example4 = await errorRecoveryExample();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const example5 = await performanceDashboard();
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  example5.stop();
  
  const example6 = await completeVTFIntegration();
  
  console.log('\n✨ Examples completed!');
}

// Export examples
export {
  basicAudioCaptureIntegration,
  adaptiveChunking,
  multiUserConference,
  errorRecoveryExample,
  performanceDashboard,
  completeVTFIntegration,
  runExamples
};

// Auto-run if accessed directly
if (typeof window !== 'undefined' && window.location.href.includes('example')) {
  runExamples();
}