/**
 * Test suite for AudioDataTransfer
 * Tests data conversion, chunking, and Chrome messaging
 */

import { AudioDataTransfer } from '../../src/modules/audio-data-transfer.js';

// Test utilities
const TestUtils = {
  // Generate test audio data
  generateAudioData(samples, frequency = 440, sampleRate = 16000) {
    const data = new Float32Array(samples);
    const angularFreq = 2 * Math.PI * frequency / sampleRate;
    
    for (let i = 0; i < samples; i++) {
      data[i] = Math.sin(angularFreq * i) * 0.5;
    }
    
    return data;
  },
  
  // Generate random audio
  generateRandomAudio(samples) {
    const data = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.8; // -0.8 to 0.8
    }
    return data;
  },
  
  // Mock chrome.runtime
  mockChromeRuntime(options = {}) {
    const mock = {
      id: 'test-extension-id',
      sendMessage: jest.fn((message, callback) => {
        if (options.shouldFail) {
          mock.lastError = { message: 'Test error' };
        } else {
          mock.lastError = null;
        }
        
        if (callback) {
          setTimeout(() => callback({ success: !options.shouldFail }), 10);
        }
      }),
      lastError: null
    };
    
    window.chrome = { runtime: mock };
    return mock;
  },
  
  // Clean up mocks
  cleanupMocks() {
    delete window.chrome;
  },
  
  // Wait helper
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  // Simple mock for chrome.runtime
  setupSimpleMock() {
    window.chrome = {
      runtime: {
        id: 'test-extension',
        sendMessage: (message, callback) => {
          console.log('[Mock] Message sent:', message.type, message.userId);
          if (callback) callback({ success: true });
        },
        lastError: null
      }
    };
  },
  
  // Run test
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
const AudioDataTransferTests = {
  // Test 1: Basic initialization
  async testInitialization() {
    TestUtils.setupSimpleMock();
    
    const transfer = new AudioDataTransfer();
    
    console.assert(transfer.CHUNK_SIZE === 16384, 'Should have default chunk size');
    console.assert(transfer.pendingChunks instanceof Map, 'Should have pending chunks map');
    console.assert(transfer.transferStats.chunksSent === 0, 'Should start with zero chunks sent');
    
    transfer.destroy();
    TestUtils.cleanupMocks();
  },
  
  // Test 2: Float32 to Int16 conversion
  async testDataConversion() {
    const transfer = new AudioDataTransfer();
    
    // Test various values
    const testCases = [
      { input: 0.0, expected: 0 },
      { input: 1.0, expected: 32767 },
      { input: -1.0, expected: -32768 },
      { input: 0.5, expected: 16383 },
      { input: -0.5, expected: -16384 },
      { input: 2.0, expected: 32767 }, // Clipping
      { input: -2.0, expected: -32768 } // Clipping
    ];
    
    for (const { input, expected } of testCases) {
      const float32 = new Float32Array([input]);
      const int16 = transfer.float32ToInt16(float32);
      console.assert(int16[0] === expected, `${input} should convert to ${expected}, got ${int16[0]}`);
    }
    
    // Test array conversion
    const sineWave = TestUtils.generateAudioData(100);
    const converted = transfer.float32ToInt16(sineWave);
    console.assert(converted.length === 100, 'Should preserve length');
    console.assert(converted instanceof Int16Array, 'Should return Int16Array');
    
    transfer.destroy();
  },
  
  // Test 3: Chunking logic
  async testChunking() {
    TestUtils.setupSimpleMock();
    
    const transfer = new AudioDataTransfer({ chunkSize: 1000 });
    const userId = 'testUser';
    
    // Send less than chunk size
    let audioData = TestUtils.generateAudioData(500);
    transfer.sendAudioData(userId, audioData);
    
    console.assert(transfer.transferStats.chunksSent === 0, 'Should not send incomplete chunk');
    console.assert(transfer.pendingChunks.get(userId).length === 500, 'Should have 500 pending');
    
    // Send more to complete chunk
    audioData = TestUtils.generateAudioData(600);
    transfer.sendAudioData(userId, audioData);
    
    await TestUtils.wait(50);
    
    console.assert(transfer.transferStats.chunksSent === 1, 'Should send one chunk');
    console.assert(transfer.pendingChunks.get(userId).length === 100, 'Should have 100 pending');
    
    // Send multiple chunks worth
    audioData = TestUtils.generateAudioData(3000);
    transfer.sendAudioData(userId, audioData);
    
    await TestUtils.wait(50);
    
    console.assert(transfer.transferStats.chunksSent === 4, 'Should send 3 more chunks');
    console.assert(transfer.pendingChunks.get(userId).length === 100, 'Should still have 100 pending');
    
    transfer.destroy();
    TestUtils.cleanupMocks();
  },
  
  // Test 4: Multiple users
  async testMultipleUsers() {
    TestUtils.setupSimpleMock();
    
    const transfer = new AudioDataTransfer({ chunkSize: 1000 });
    const users = ['user1', 'user2', 'user3'];
    
    // Send data for each user
    for (const userId of users) {
      const audioData = TestUtils.generateAudioData(2500);
      transfer.sendAudioData(userId, audioData);
    }
    
    await TestUtils.wait(100);
    
    console.assert(transfer.transferStats.chunksSent === 6, 'Should send 2 chunks per user');
    console.assert(transfer.pendingChunks.size === 3, 'Should track 3 users');
    
    // Check per-user stats
    for (const userId of users) {
      const stats = transfer.getUserStats(userId);
      console.assert(stats.chunksSent === 2, `${userId} should have sent 2 chunks`);
      console.assert(stats.pendingSamples === 500, `${userId} should have 500 pending`);
    }
    
    transfer.destroy();
    TestUtils.cleanupMocks();
  },
  
  // Test 5: Flush functionality
  async testFlush() {
    TestUtils.setupSimpleMock();
    
    const transfer = new AudioDataTransfer({ chunkSize: 1000 });
    const userId = 'flushTest';
    
    // Send partial data
    const audioData = TestUtils.generateAudioData(750);
    transfer.sendAudioData(userId, audioData);
    
    console.assert(transfer.transferStats.chunksSent === 0, 'Should not send yet');
    
    // Flush the user
    const flushed = transfer.flush(userId);
    
    await TestUtils.wait(50);
    
    console.assert(flushed === true, 'Should flush successfully');
    console.assert(transfer.transferStats.chunksSent === 1, 'Should send padded chunk');
    console.assert(transfer.pendingChunks.get(userId).length === 0, 'Should clear pending');
    
    // Test flush all
    const users = ['flush1', 'flush2'];
    for (const user of users) {
      transfer.sendAudioData(user, TestUtils.generateAudioData(500));
    }
    
    const flushedCount = transfer.flushAll();
    
    await TestUtils.wait(50);
    
    console.assert(flushedCount === 2, 'Should flush 2 users');
    console.assert(transfer.transferStats.chunksSent === 3, 'Should have sent 3 total chunks');
    
    transfer.destroy();
    TestUtils.cleanupMocks();
  },
  
  // Test 6: Buffer overflow handling
  async testBufferOverflow() {
    const transfer = new AudioDataTransfer({ 
      chunkSize: 1000,
      maxPendingSize: 2000 
    });
    
    const userId = 'overflowTest';
    
    // Fill buffer to limit
    transfer.sendAudioData(userId, TestUtils.generateAudioData(1999));
    console.assert(transfer.pendingChunks.get(userId).length === 1999, 'Should accept data');
    
    // Exceed limit
    transfer.sendAudioData(userId, TestUtils.generateAudioData(500));
    console.assert(transfer.pendingChunks.get(userId).length === 2000, 'Should limit to max');
    console.assert(transfer.transferStats.droppedSamples === 499, 'Should track dropped samples');
    
    transfer.destroy();
  },
  
  // Test 7: Error handling and retry
  async testErrorHandling() {
    // Mock with errors
    const mockRuntime = {
      id: 'test-extension',
      sendMessage: (message, callback) => {
        mockRuntime.lastError = { message: 'Test error' };
        if (callback) setTimeout(() => callback(), 10);
      },
      lastError: null
    };
    
    window.chrome = { runtime: mockRuntime };
    
    const transfer = new AudioDataTransfer({ 
      chunkSize: 1000,
      retryAttempts: 2,
      retryDelay: 50
    });
    
    const userId = 'errorTest';
    
    // Send data that will fail
    transfer.sendAudioData(userId, TestUtils.generateAudioData(1000));
    
    // Wait for retries
    await TestUtils.wait(300);
    
    console.assert(transfer.transferStats.errors >= 1, 'Should track errors');
    console.assert(transfer.transferStats.retries >= 1, 'Should track retries');
    console.assert(transfer.failedChunks.length > 0, 'Should queue failed chunks');
    
    transfer.destroy();
    TestUtils.cleanupMocks();
  },
  
  // Test 8: Configuration updates
  async testConfiguration() {
    const transfer = new AudioDataTransfer();
    
    // Update chunk size
    transfer.setChunkSize(8192);
    console.assert(transfer.CHUNK_SIZE === 8192, 'Should update chunk size');
    
    // Test invalid chunk sizes
    try {
      transfer.setChunkSize(500);
      console.assert(false, 'Should throw for too small chunk size');
    } catch (e) {
      console.assert(e.message.includes('between 1024 and 65536'), 'Should have size error');
    }
    
    // Update max pending size
    transfer.setMaxPendingSize(32768);
    console.assert(transfer.config.maxPendingSize === 32768, 'Should update max pending');
    
    transfer.destroy();
  },
  
  // Test 9: Statistics
  async testStatistics() {
    TestUtils.setupSimpleMock();
    
    const transfer = new AudioDataTransfer({ chunkSize: 1000 });
    
    // Send data for multiple users
    const users = ['stats1', 'stats2'];
    for (const userId of users) {
      transfer.sendAudioData(userId, TestUtils.generateAudioData(2500));
    }
    
    await TestUtils.wait(100);
    
    // Get overall stats
    const stats = transfer.getStats();
    console.log('Overall stats:', stats);
    
    console.assert(stats.chunksSent === 4, 'Should track chunks sent');
    console.assert(stats.conversions === 2, 'Should track conversions');
    console.assert(stats.pendingUsers === 2, 'Should track pending users');
    console.assert(stats.bytesSent === 8000, 'Should track bytes sent');
    
    // Reset stats
    transfer.resetStats();
    const resetStats = transfer.getStats();
    console.assert(resetStats.chunksSent === 0, 'Should reset chunks sent');
    console.assert(resetStats.conversions === 0, 'Should reset conversions');
    
    transfer.destroy();
    TestUtils.cleanupMocks();
  },
  
  // Test 10: Performance
  async testPerformance() {
    const transfer = new AudioDataTransfer();
    
    // Test conversion performance
    const samples = 16384; // 1 second
    const audioData = TestUtils.generateRandomAudio(samples);
    
    const startTime = performance.now();
    const converted = transfer.float32ToInt16(audioData);
    const conversionTime = performance.now() - startTime;
    
    console.log(`Conversion time for ${samples} samples: ${conversionTime.toFixed(2)}ms`);
    console.assert(conversionTime < 10, 'Conversion should be fast (<10ms)');
    console.assert(converted.length === samples, 'Should preserve all samples');
    
    // Test chunking performance
    const startChunk = performance.now();
    for (let i = 0; i < 10; i++) {
      transfer.sendAudioData(`perfUser${i}`, audioData);
    }
    const chunkTime = performance.now() - startChunk;
    
    console.log(`Chunking time for 10 users: ${chunkTime.toFixed(2)}ms`);
    console.assert(chunkTime < 50, 'Chunking should be fast (<50ms)');
    
    transfer.destroy();
  }
};

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting AudioDataTransfer tests...\n');
  
  const tests = [
    ['Initialization', AudioDataTransferTests.testInitialization],
    ['Data Conversion', AudioDataTransferTests.testDataConversion],
    ['Chunking Logic', AudioDataTransferTests.testChunking],
    ['Multiple Users', AudioDataTransferTests.testMultipleUsers],
    ['Flush Functionality', AudioDataTransferTests.testFlush],
    ['Buffer Overflow', AudioDataTransferTests.testBufferOverflow],
    ['Error Handling', AudioDataTransferTests.testErrorHandling],
    ['Configuration', AudioDataTransferTests.testConfiguration],
    ['Statistics', AudioDataTransferTests.testStatistics],
    ['Performance', AudioDataTransferTests.testPerformance]
  ];
  
  for (const [name, testFn] of tests) {
    await TestUtils.runTest(name, testFn);
    await TestUtils.wait(200);
  }
  
  console.log('\n✨ All tests completed!');
}

// Export test functions
export { runAllTests, AudioDataTransferTests, TestUtils };

// Auto-run if accessed directly
if (typeof window !== 'undefined' && window.location.href.includes('test')) {
  runAllTests();
}