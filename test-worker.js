// test-worker.js - Simple worker to test if workers load at all
console.log('[Test Worker] Loading...');

self.addEventListener('message', (event) => {
    console.log('[Test Worker] Received message:', event.data);
    
    // Echo back
    self.postMessage({
        type: 'echo',
        original: event.data,
        timestamp: Date.now()
    });
});

console.log('[Test Worker] Ready');

// Send ready message
self.postMessage({ type: 'ready' });