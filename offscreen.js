// offscreen.js - Runs transcription worker in offscreen document
console.log('Offscreen document loaded');

let transcriptionWorker = null;
let isReady = false;
let keepAliveInterval = null;

// Keep offscreen document alive during initialization
function startKeepAlive() {
    keepAliveInterval = setInterval(() => {
        // Just having a timer keeps the document alive
        if (isReady && keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
        }
    }, 1000); // Every second during init
}

// Initialize transcription worker
async function initializeWorker() {
    try {
        console.log('Offscreen: Creating worker...');
        startKeepAlive(); // Keep alive during initialization
        
        transcriptionWorker = new Worker('transcription-worker.js');
        
        transcriptionWorker.onmessage = (event) => {
            // Forward all messages to background
            chrome.runtime.sendMessage({
                type: 'worker_message',
                data: event.data
            });
            
            // Mark ready when Vosk is initialized
            if (event.data.type === 'ready') {
                isReady = true;
                console.log('Offscreen: Worker ready, stopping keep-alive');
            }
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
        
    } catch (error) {
        console.error('Offscreen: Failed to create worker:', error);
        chrome.runtime.sendMessage({
            type: 'worker_error',
            error: error.toString()
        });
    }
}

// Keep worker alive with periodic activity
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
            if (!isReady && !transcriptionWorker) {
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
    
    return false;
});

// Initialize immediately
initializeWorker();