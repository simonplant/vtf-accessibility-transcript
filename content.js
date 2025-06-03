// content.js - Handles communication and Vosk transcription
console.log('VTF Transcription: Content script loaded');

// State management
let isTranscribing = false;
let audioContext = null;
let audioProcessor = null;
let transcriptionWorker = null;
let sourceNode = null;

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

// Initialize transcription worker
async function initializeTranscriptionWorker() {
    try {
        console.log('VTF Transcription: Initializing worker...');
        
        // Create worker
        transcriptionWorker = new Worker(chrome.runtime.getURL('transcription-worker.js'));
        
        // Handle worker messages
        transcriptionWorker.onmessage = (event) => {
            const { type, text, isFinal, error, message } = event.data;
            
            switch (type) {
                case 'ready':
                    console.log('VTF Transcription: Vosk ready!');
                    chrome.runtime.sendMessage({ type: 'transcription_ready' });
                    break;
                    
                case 'status':
                    console.log('VTF Transcription:', message);
                    break;
                    
                case 'transcript':
                    if (isFinal) {
                        chrome.runtime.sendMessage({
                            type: 'transcription_result',
                            transcript: text,
                            timestamp: Date.now(),
                            confidence: 0.9
                        });
                    } else {
                        chrome.runtime.sendMessage({
                            type: 'interim_transcription',
                            transcript: text
                        });
                    }
                    break;
                    
                case 'error':
                    console.error('VTF Transcription: Worker error:', error);
                    chrome.runtime.sendMessage({
                        type: 'transcription_error',
                        error: error
                    });
                    break;
            }
        };
        
        // Handle worker errors
        transcriptionWorker.onerror = (error) => {
            console.error('VTF Transcription: Worker crashed:', error);
            // Attempt to restart
            setTimeout(() => {
                console.log('VTF Transcription: Attempting worker restart...');
                initializeTranscriptionWorker();
            }, 2000);
        };
        
        // Initialize Vosk in worker
        transcriptionWorker.postMessage({ type: 'init' });
        
    } catch (error) {
        console.error('VTF Transcription: Worker init error:', error);
    }
}

// Set up audio processing
async function setupAudioProcessing() {
    // This function will be called from inject.js context
    window.addEventListener('message', async (event) => {
        if (event.data.type === 'VTF_START_PROCESSING') {
            try {
                // Create audio context for processing
                audioContext = new AudioContext({ sampleRate: 16000 });
                
                // Try to use AudioWorklet (modern approach)
                try {
                    await audioContext.audioWorklet.addModule(
                        chrome.runtime.getURL('audio-processor.js')
                    );
                    
                    audioProcessor = new AudioWorkletNode(audioContext, 'vtf-audio-processor');
                    
                    audioProcessor.port.onmessage = (e) => {
                        if (!isTranscribing) return;
                        
                        if (e.data.type === 'audio' && transcriptionWorker) {
                            transcriptionWorker.postMessage({
                                type: 'process',
                                data: e.data.data
                            });
                        }
                    };
                    
                    console.log('VTF Transcription: Using AudioWorklet (modern)');
                    
                } catch (workletError) {
                    // Fallback to ScriptProcessor if AudioWorklet fails
                    console.log('VTF Transcription: Falling back to ScriptProcessor');
                    
                    const bufferSize = 4096;
                    audioProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
                    
                    audioProcessor.onaudioprocess = (e) => {
                        if (!isTranscribing) return;
                        
                        const inputData = e.inputBuffer.getChannelData(0);
                        const pcmData = new Float32Array(inputData);
                        
                        // Send to worker
                        if (transcriptionWorker) {
                            transcriptionWorker.postMessage({
                                type: 'process',
                                data: pcmData
                            });
                        }
                    };
                }
                
                // Request access to the stream from inject.js
                window.postMessage({ type: 'VTF_REQUEST_STREAM' }, '*');
                
            } catch (error) {
                console.error('VTF Transcription: Audio setup error:', error);
            }
        }
        
        if (event.data.type === 'VTF_STREAM_DATA' && event.data.stream) {
            // Connect the stream
            try {
                sourceNode = audioContext.createMediaStreamSource(event.data.stream);
                sourceNode.connect(audioProcessor);
                audioProcessor.connect(audioContext.destination);
                console.log('VTF Transcription: Audio pipeline connected');
            } catch (error) {
                console.error('VTF Transcription: Stream connection error:', error);
                chrome.runtime.sendMessage({
                    type: 'transcription_error',
                    error: 'Failed to connect audio stream'
                });
            }
        }
    });
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

        // Initialize worker
        await initializeTranscriptionWorker();
        
        // Set up audio processing
        setupAudioProcessing();
    }
});

// Start/stop transcription
function startTranscription() {
    if (!isTranscribing) {
        isTranscribing = true;
        
        console.log('VTF Transcription: Starting...');
        
        // Start audio processing
        window.postMessage({ type: 'VTF_START_PROCESSING' }, '*');
        
        chrome.runtime.sendMessage({
            type: 'transcription_status',
            status: 'started'
        });
    }
}

function stopTranscription() {
    if (isTranscribing) {
        isTranscribing = false;
        
        console.log('VTF Transcription: Stopping...');
        
        // Get final result
        if (transcriptionWorker) {
            transcriptionWorker.postMessage({ type: 'final' });
        }
        
        // Disconnect audio
        if (sourceNode) {
            sourceNode.disconnect();
        }
        if (audioProcessor) {
            audioProcessor.disconnect();
        }
        
        chrome.runtime.sendMessage({
            type: 'transcription_status',
            status: 'stopped'
        });
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