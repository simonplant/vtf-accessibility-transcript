// offscreen.js - Runs Vosk transcription directly (no worker)
console.log('Offscreen document loaded');

let recognizer = null;
let model = null;
let isReady = false;
let audioContext = null;

// Create audio context to keep document active
function createDummyAudio() {
    if (!audioContext) {
        audioContext = new AudioContext();
        // Create a silent source to keep context active
        const source = audioContext.createConstantSource();
        source.offset.value = 0; // Silent
        source.connect(audioContext.destination);
        source.start();
        console.log('Offscreen: Created audio context to stay active');
    }
}

// Initialize Vosk directly (no worker)
async function initializeVosk() {
    try {
        console.log('Offscreen: Loading Vosk...');
        createDummyAudio(); // Keep document active
        
        // Load Vosk library
        const script = document.createElement('script');
        script.src = 'vosk.js';
        document.head.appendChild(script);
        
        // Wait for Vosk to be available
        await new Promise((resolve) => {
            script.onload = resolve;
        });
        
        console.log('Offscreen: Vosk library loaded, window.Vosk:', window.Vosk);
        // Also log to service worker
        chrome.runtime.sendMessage({
            type: 'worker_message',
            data: { type: 'status', message: 'Vosk object: ' + (window.Vosk ? 'loaded' : 'undefined') }
        });
        
        chrome.runtime.sendMessage({
            type: 'worker_message',
            data: { type: 'status', message: 'Loading model (40MB)...' }
        });
        
        // Load model - use the unzipped folder instead of zip
        const modelUrl = chrome.runtime.getURL('vosk-model-small-en-us-0.15');
        console.log('Offscreen: Loading model from:', modelUrl);
        
        try {
            console.log('Offscreen: Calling Vosk.createModel...');
            model = await window.Vosk.createModel(modelUrl);
            console.log('Offscreen: Model loaded!');
        } catch (err) {
            console.error('Offscreen: createModel failed:', err);
            throw err;
        }
        
        // Create recognizer
        recognizer = new model.KaldiRecognizer(16000);
        
        isReady = true;
        console.log('Offscreen: Vosk ready!');
        
        chrome.runtime.sendMessage({
            type: 'worker_message',
            data: { type: 'ready' }
        });
        
    } catch (error) {
        console.error('Offscreen: Vosk init error:', error);
        chrome.runtime.sendMessage({
            type: 'worker_error',
            error: error.toString()
        });
    }
}

// Process audio data
function processAudio(audioData) {
    if (!isReady || !recognizer) return;
    
    try {
        const result = recognizer.acceptWaveform(audioData);
        
        if (result) {
            const resultJson = JSON.parse(recognizer.result());
            if (resultJson.text && resultJson.text.trim() !== '') {
                chrome.runtime.sendMessage({
                    type: 'worker_message',
                    data: {
                        type: 'transcript',
                        text: resultJson.text,
                        isFinal: true,
                        timestamp: Date.now()
                    }
                });
            }
        } else {
            const partialJson = JSON.parse(recognizer.partialResult());
            if (partialJson.partial && partialJson.partial.trim() !== '') {
                chrome.runtime.sendMessage({
                    type: 'worker_message',
                    data: {
                        type: 'transcript',
                        text: partialJson.partial,
                        isFinal: false,
                        timestamp: Date.now()
                    }
                });
            }
        }
    } catch (error) {
        console.error('Offscreen: Process error:', error);
    }
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Keep audio context active on any message
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    switch (request.type) {
        case 'init_worker':
            if (!isReady && !model) {
                initializeVosk();
            }
            break;
            
        case 'process_audio':
            if (isReady) {
                processAudio(new Float32Array(request.data));
            }
            break;
            
        case 'get_final':
            if (recognizer) {
                const finalJson = JSON.parse(recognizer.finalResult());
                if (finalJson.text && finalJson.text.trim() !== '') {
                    chrome.runtime.sendMessage({
                        type: 'worker_message',
                        data: {
                            type: 'transcript',
                            text: finalJson.text,
                            isFinal: true,
                            timestamp: Date.now()
                        }
                    });
                }
            }
            break;
            
        case 'keepalive':
            sendResponse({ alive: true });
            break;
    }
    
    return false;
});

// Initialize immediately
initializeVosk();