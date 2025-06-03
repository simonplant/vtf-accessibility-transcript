// offscreen.js - Runs transcription worker in offscreen document
console.log('Offscreen document loaded');

let transcriptionWorker = null;
let isReady = false;

// Initialize transcription worker
async function initializeWorker() {
    try {
        console.log('Offscreen: Creating worker...');
        transcriptionWorker = new Worker('transcription-worker.js');
        
        transcriptionWorker.onmessage = (event) => {
            // Forward all messages to background
            chrome.runtime.sendMessage({
                type: 'worker_message',
                data: event.data
            });
        };
        
        transcriptionWorker.onerror = (error) => {
            console.error('Offscreen: Worker error:', error);
            chrome.runtime.sendMessage({
                type: 'worker_error',
                error: error.toString()
            });
        };
        
        // Initialize Vosk
        transcriptionWorker.postMessage({ type: 'init' });
        isReady = true;
        
    } catch (error) {
        console.error('Offscreen: Failed to create worker:', error);
        chrome.runtime.sendMessage({
            type: 'worker_error',
            error: error.toString()
        });
    }
}

// Keep worker alive
setInterval(() => {
    if (transcriptionWorker && isReady) {
        // Send empty message to keep worker active
        transcriptionWorker.postMessage({ type: 'keepalive' });
    }
}, 30000); // Every 30 seconds

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
        case 'init_worker':
            if (!isReady) {
                initializeWorker();
            }
            break;
            
        case 'process_audio':
            if (transcriptionWorker && isReady) {
                transcriptionWorker.postMessage({
                    type: 'process',
                    data: new Float32Array(request.data)
                });
            }
            break;
            
        case 'get_final':
            if (transcriptionWorker) {
                transcriptionWorker.postMessage({ type: 'final' });
            }
            break;
            
        case 'keepalive':
            // Just respond to keep connection alive
            sendResponse({ alive: true });
            break;
    }
});

// Initialize immediately
initializeWorker();