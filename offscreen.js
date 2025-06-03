// offscreen.js - Handles audio processing and transcription
console.log('Offscreen document loaded');

let isReady = false;
let audioContext = null;

// Create audio context to keep document active
function createDummyAudio() {
    if (!audioContext) {
        audioContext = new AudioContext();
        const source = audioContext.createConstantSource();
        source.offset.value = 0; // Silent
        source.connect(audioContext.destination);
        source.start();
        console.log('Offscreen: Created audio context to stay active');
    }
}

// Initialize transcription
async function initializeTranscription() {
    try {
        console.log('Offscreen: Initializing transcription...');
        createDummyAudio(); // Keep document active
        
        // TODO: Replace this section with a working speech recognition library
        // Requirements:
        // 1. Must work with Manifest V3 (no eval/unsafe-inline)
        // 2. Must process Float32Array audio chunks
        // 3. Must work offline
        // 4. Suggested libraries to research:
        //    - Whisper ONNX Web
        //    - TensorFlow.js with speech model
        //    - whisper.cpp compiled to WASM
        //    - Any WASM-based speech recognition
        
        // For now, just mark as ready and log audio data
        isReady = true;
        console.log('Offscreen: Ready (no transcription library loaded yet)');
        
        chrome.runtime.sendMessage({
            type: 'worker_message',
            data: { type: 'ready' }
        });
        
    } catch (error) {
        console.error('Offscreen: Init error:', error);
        chrome.runtime.sendMessage({
            type: 'worker_error',
            error: error.toString()
        });
    }
}

// Process audio data
function processAudio(audioData) {
    if (!isReady) return;
    
    // TODO: Process audio with speech recognition library
    // For now, just log that we received audio
    
    // Uncomment to see audio data flow:
    // console.log('Offscreen: Received audio chunk, length:', audioData.length);
    
    // Example of how transcription results should be sent:
    /*
    const transcriptionResult = {
        type: 'transcript',
        text: 'transcribed text here',
        isFinal: true,
        timestamp: Date.now()
    };
    
    chrome.runtime.sendMessage({
        type: 'worker_message',
        data: transcriptionResult
    });
    */
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Keep audio context active
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    switch (request.type) {
        case 'init_worker':
            if (!isReady) {
                initializeTranscription();
            }
            break;
            
        case 'process_audio':
            if (isReady) {
                processAudio(new Float32Array(request.data));
            }
            break;
            
        case 'keepalive':
            sendResponse({ alive: true });
            break;
    }
    
    return false;
});

// Initialize immediately
initializeTranscription();