// content.js - Handles communication and Vosk transcription (FREE)
console.log('VTF Transcription: Content script loaded');

// State management
let isTranscribing = false;
let recognizer = null;
let audioContext = null;

// Inject the audio capture script
function injectScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function() {
        console.log('VTF Transcription: Inject script loaded');
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
}

// Handle messages from the injected script
window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'VTF_AUDIO_STREAM_READY') {
        console.log('VTF Transcription: Audio stream ready', event.data);
        
        // Notify background script
        chrome.runtime.sendMessage({
            type: 'stream_ready',
            streamId: event.data.streamId,
            trackCount: event.data.trackCount
        });

        // Initialize transcription after stream is ready
        // Note: We'll use a different approach that doesn't require inline scripts
        console.log('VTF Transcription: Ready to start transcription');
    }
});

// Initialize transcription using Chrome's native capabilities
async function initializeTranscription() {
    try {
        console.log('VTF Transcription: Initializing transcription...');
        
        // For now, we'll use a simplified approach
        // Later we can add Vosk or other transcription services
        
        // Notify that we're ready
        chrome.runtime.sendMessage({
            type: 'transcription_ready'
        });
        
    } catch (error) {
        console.error('VTF Transcription: Initialization error:', error);
        chrome.runtime.sendMessage({
            type: 'transcription_error',
            error: error.message
        });
    }
}

// Start/stop transcription
function startTranscription() {
    if (!isTranscribing) {
        isTranscribing = true;
        
        console.log('VTF Transcription: Started');
        
        // For now, just update status
        // We'll add actual transcription in the next step
        chrome.runtime.sendMessage({
            type: 'transcription_status',
            status: 'started'
        });
        
        // Simulate transcription for testing
        simulateTranscription();
    }
}

function stopTranscription() {
    if (isTranscribing) {
        isTranscribing = false;
        
        console.log('VTF Transcription: Stopped');
        
        chrome.runtime.sendMessage({
            type: 'transcription_status',
            status: 'stopped'
        });
    }
}

// Temporary: Simulate transcription to test the UI
function simulateTranscription() {
    if (!isTranscribing) return;
    
    // Send a test transcript every 5 seconds
    const testPhrases = [
        "Testing audio capture system",
        "Market is looking strong today",
        "Check the SPY levels",
        "Volume coming in on this move",
        "Watch for resistance at this level"
    ];
    
    const phrase = testPhrases[Math.floor(Math.random() * testPhrases.length)];
    
    chrome.runtime.sendMessage({
        type: 'transcription_result',
        transcript: phrase,
        timestamp: Date.now(),
        confidence: 0.95
    });
    
    // Continue simulating if still transcribing
    if (isTranscribing) {
        setTimeout(simulateTranscription, 5000);
    }
}

// Handle messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
        case 'start_transcription':
            startTranscription();
            sendResponse({ success: true });
            break;
            
        case 'stop_transcription':
            stopTranscription();
            sendResponse({ success: true });
            break;
            
        case 'check_audio':
            // Check if audio stream is available
            // We'll check by sending a message to the page
            window.postMessage({ type: 'VTF_CHECK_STREAM' }, '*');
            
            // Listen for response
            const checkHandler = (event) => {
                if (event.data.type === 'VTF_STREAM_STATUS') {
                    window.removeEventListener('message', checkHandler);
                    sendResponse({ 
                        audioReady: event.data.ready,
                        isTranscribing: isTranscribing 
                    });
                }
            };
            window.addEventListener('message', checkHandler);
            
            return true; // Will respond asynchronously
            
        case 'ping':
            sendResponse({ alive: true });
            break;
    }
    
    return true;
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        injectScript();
        initializeTranscription();
    });
} else {
    injectScript();
    initializeTranscription();
}

// Add handler for stream status check
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'VTF_CHECK_STREAM') {
        // This will be handled by inject.js
    }
});