

import { AudioDataTransfer } from '../../src/modules/audio-data-transfer.js';

const TestUtils = {
  
  generateAudioData(samples, frequency = 440, sampleRate = 16000) {
    const data = new Float32Array(samples);
    const angularFreq = 2 * Math.PI * frequency / sampleRate;
    
    for (let i = 0; i < samples; i++) {
      data[i] = Math.sin(angularFreq * i) * 0.5;
    }
    
    return data;
  },
  
  
  generateRandomAudio(samples) {
    const data = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.8; 
    }
    return data;
  },
  
  
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
  
  
  cleanupMocks() {
    delete window.chrome;
  },
  
  
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  
  setupSimpleMock() {
    window.chrome = {
      runtime: {
        id: 'test-extension',
        sendMessage: (message, callback) => {
          
          if (callback) callback({ success: true });
        },
        lastError: null
      }
    };
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

const AudioDataTransferTests = {
  
  async testInitialization() {
    TestUtils.setupSimpleMock();
    
    const transfer = new AudioDataTransfer();
    
    console.assert(transfer.CHUNK_SIZE === 16384, 'Should have default chunk size');
    console.assert(transfer.pendingChunks instanceof Map, 'Should have pending chunks map');
    console.assert(transfer.transferStats.chunksSent === 0, 'Should start with zero chunks sent');
    
    transfer.destroy();
    TestUtils.cleanupMocks();
  },
  
  
  async testDataConversion() {
    const transfer = new AudioDataTransfer();
    
    
    const testCases = [
      { input: 0.0, expected: 0 },
      { input: 1.0, expected: 32767 },
      { input: -1.0, expected: -32768 },
      { input: 0.5, expected: 16383 },
      { input: -0.5, expected: -16384 },
      { input: 2.0, expected: 32767 }, 
      { input: -2.0, expected: -32768 } 
    ];
    
    for (const { input, expected } of testCases) {
      const float32 = new Float32Array([input]);
      const int16 = transfer.float32ToInt16(float32);
      console.assert(int16[0] === expected, `${input} should convert to ${expected}, got ${int16[0]}`);
    }
    
    
    const sineWave = TestUtils.generateAudioData(100);
    const converted = transfer.float32ToInt16(sineWave);
    console.assert(converted.length === 100, 'Should preserve length');
    console.assert(converted instanceof Int16Array, 'Should return Int16Array');
    
    transfer.destroy();
  },
  
  
  async testChunking() {
    TestUtils.setupSimpleMock();
    
    const transfer = new AudioDataTransfer({ chunkSize: 1000 });
    const userId = 'testUser';
    
    
    let audioData = TestUtils.generateAudioData(500);
    transfer.sendAudioData(userId, audioData);
    
    console.assert(transfer.transferStats.chunksSent === 0, 'Should not send incomplete chunk');
    console.assert(transfer.pendingChunks.get(userId).length === 500, 'Should have 500 pending');
    
    
    audioData = TestUtils.generateAudioData(600);
    transfer.sendAudioData(userId, audioData);
    
    await TestUtils.wait(50);
    
    console.assert(transfer.transferStats.chunksSent === 1, 'Should send one chunk');
    console.assert(transfer.pendingChunks.get(userId).length === 100, 'Should have 100 pending');
    
    
    audioData = TestUtils.generateAudioData(3000);
    transfer.sendAudioData(userId, audioData);
    
    await TestUtils.wait(50);
    
    console.assert(transfer.transferStats.chunksSent === 4, 'Should send 3 more chunks');
    console.assert(transfer.pendingChunks.get(userId).length === 100, 'Should still have 100 pending');
    
    transfer.destroy();
    TestUtils.cleanupMocks();
  },
  
  
  async testMultipleUsers() {
    TestUtils.setupSimpleMock();
    
    const transfer = new AudioDataTransfer({ chunkSize: 1000 });
    const users = ['user1', 'user2', 'user3'];
    
    
    for (const userId of users) {
      const audioData = TestUtils.generateAudioData(2500);
      transfer.sendAudioData(userId, audioData);
    }
    
    await TestUtils.wait(100);
    
    console.assert(transfer.transferStats.chunksSent === 6, 'Should send 2 chunks per user');
    console.assert(transfer.pendingChunks.size === 3, 'Should track 3 users');
    
    
    for (const userId of users) {
      const stats = transfer.getUserStats(userId);
      console.assert(stats.chunksSent === 2, `${userId} should have sent 2 chunks`);
      console.assert(stats.pendingSamples === 500, `${userId} should have 500 pending`);
    }
    
    transfer.destroy();
    TestUtils.cleanupMocks();
  },
  
  
  async testFlush() {
    TestUtils.setupSimpleMock();
    
    const transfer = new AudioDataTransfer({ chunkSize: 1000 });
    const userId = 'flushTest';
    
    
    const audioData = TestUtils.generateAudioData(750);
    transfer.sendAudioData(userId, audioData);
    
    console.assert(transfer.transferStats.chunksSent === 0, 'Should not send yet');
    
    
    const flushed = transfer.flush(userId);
    
    await TestUtils.wait(50);
    
    console.assert(flushed === true, 'Should flush successfully');
    console.assert(transfer.transferStats.chunksSent === 1, 'Should send padded chunk');
    console.assert(transfer.pendingChunks.get(userId).length === 0, 'Should clear pending');
    
    
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
  
  
  async testBufferOverflow() {
    const transfer = new AudioDataTransfer({ 
      chunkSize: 1000,
      maxPendingSize: 2000 
    });
    
    const userId = 'overflowTest';
    
    
    transfer.sendAudioData(userId, TestUtils.generateAudioData(1999));
    console.assert(transfer.pendingChunks.get(userId).length === 1999, 'Should accept data');
    
    
    transfer.sendAudioData(userId, TestUtils.generateAudioData(500));
    console.assert(transfer.pendingChunks.get(userId).length === 2000, 'Should limit to max');
    console.assert(transfer.transferStats.droppedSamples === 499, 'Should track dropped samples');
    
    transfer.destroy();
  },
  
  
  async testErrorHandling() {
    
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
    
    
    transfer.sendAudioData(userId, TestUtils.generateAudioData(1000));
    
    
    await TestUtils.wait(300);
    
    console.assert(transfer.transferStats.errors >= 1, 'Should track errors');
    console.assert(transfer.transferStats.retries >= 1, 'Should track retries');
    console.assert(transfer.failedChunks.length > 0, 'Should queue failed chunks');
    
    transfer.destroy();
    TestUtils.cleanupMocks();
  },
  
  
  async testConfiguration() {
    const transfer = new AudioDataTransfer();
    
    
    transfer.setChunkSize(8192);
    console.assert(transfer.CHUNK_SIZE === 8192, 'Should update chunk size');
    
    
    try {
      transfer.setChunkSize(500);
      console.assert(false, 'Should throw for too small chunk size');
    } catch (e) {
      console.assert(e.message.includes('between 1024 and 65536'), 'Should have size error');
    }
    
    
    transfer.setMaxPendingSize(32768);
    console.assert(transfer.config.maxPendingSize === 32768, 'Should update max pending');
    
    transfer.destroy();
  },
  
  
  async testStatistics() {
    TestUtils.setupSimpleMock();
    
    const transfer = new AudioDataTransfer({ chunkSize: 1000 });
    
    
    const users = ['stats1', 'stats2'];
    for (const userId of users) {
      transfer.sendAudioData(userId, TestUtils.generateAudioData(2500));
    }
    
    await TestUtils.wait(100);
    
    
    const stats = transfer.getStats();
    
    console.assert(stats.chunksSent === 4, 'Should track chunks sent');
    console.assert(stats.conversions === 2, 'Should track conversions');
    console.assert(stats.pendingUsers === 2, 'Should track pending users');
    console.assert(stats.bytesSent === 8000, 'Should track bytes sent');
    
    
    transfer.resetStats();
    const resetStats = transfer.getStats();
    console.assert(resetStats.chunksSent === 0, 'Should reset chunks sent');
    console.assert(resetStats.conversions === 0, 'Should reset conversions');
    
    transfer.destroy();
    TestUtils.cleanupMocks();
  },
  
  
  async testPerformance() {
    const transfer = new AudioDataTransfer();
    
    
    const samples = 16384; 
    const audioData = TestUtils.generateRandomAudio(samples);
    
    const startTime = performance.now();
    const converted = transfer.float32ToInt16(audioData);
    const conversionTime = performance.now() - startTime;
    
    
    console.assert(conversionTime < 10, 'Conversion should be fast (<10ms)');
    console.assert(converted.length === samples, 'Should preserve all samples');
    
    
    const startChunk = performance.now();
    for (let i = 0; i < 10; i++) {
      transfer.sendAudioData(`perfUser${i}`, audioData);
    }
    const chunkTime = performance.now() - startChunk;
    
    
    console.assert(chunkTime < 50, 'Chunking should be fast (<50ms)');
    
    transfer.destroy();
  }
};

async function runAllTests() {
  
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
  
  
}

export { runAllTests, AudioDataTransferTests, TestUtils };

if (typeof window !== 'undefined' && window.location.href.includes('test')) {
  runAllTests();
}