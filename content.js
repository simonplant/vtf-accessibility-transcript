// content.js - Captures audio and sends to background for transcription
console.log('VTF Transcription: Content script loaded');

// State management
let isTranscribing = false;
let audioContext = null;
let audioProcessor = null;
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

// Set up audio processing
async function setupAudioProcessing() {
    window.addEventListener('message', async (event) => {
        if (event.data.type === 'VTF_START_PROCESSING') {
            try {
                // Create audio context for processing
                audioContext = new AudioContext({ sampleRate: 16000 });
                
                // Use ScriptProcessor for now (works everywhere)
                const bufferSize = 4096;
                audioProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
                
                audioProcessor.onaudioprocess = (e) => {
                    if (!isTranscribing) return;
                    
                    const inputData = e.inputBuffer.getChannelData(0);
                    const pcmData = new Float32Array(inputData);
                    
                    // Send to background script for processing
                    chrome.runtime.sendMessage({
                        type: 'audio_data',
                        data: Array.from(pcmData) // Convert to regular array for message passing
                    });
                };
                
                // Request access to the stream from inject.js
                window.postMessage({ type: 'VTF_REQUEST_STREAM' }, '*');
                
            } catch (error) {
                console.error('VTF Transcription: Audio setup error:', error);
                chrome.runtime.sendMessage({
                    type: 'transcription_error',
                    error: 'Failed to set up audio processing'
                });
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
        
        // Set up audio processing
        setupAudioProcessing();
    }
});

// Keep connection alive
let connectionCheckInterval;

function startConnectionCheck() {
    connectionCheckInterval = setInterval(() => {
        if (isTranscribing) {
            // Send heartbeat to background
            chrome.runtime.sendMessage({ type: 'heartbeat' }).catch(() => {
                console.log('VTF Transcription: Lost connection to background, attempting reconnect...');
                // Try to reconnect
                setTimeout(() => {
                    chrome.runtime.sendMessage({
                        type: 'transcription_status',
                        status: 'started'
                    });
                }, 1000);
            });
        }
    }, 30000); // Every 30 seconds
}

function stopConnectionCheck() {
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
        connectionCheckInterval = null;
    }
}

// Start/stop transcription
function startTranscription() {
    if (!isTranscribing) {
        isTranscribing = true;
        
        console.log('VTF Transcription: Starting...');
        
        // Start audio processing
        window.postMessage({ type: 'VTF_START_PROCESSING' }, '*');
        
        // Start connection monitoring
        startConnectionCheck();
        
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
        
        // Stop connection monitoring
        stopConnectionCheck();
        
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
            sendResponse({ 
                audioReady: true,
                isTranscribing: isTranscribing 
            });
            break;
            
        case 'ping':
            sendResponse({ alive: true });
            break;
            
        case 'worker_ready':
            console.log('VTF Transcription: Worker is ready in background');
            break;
    }
    
    return true;
});

// Handle stream status checks
window.addEventListener('message', (event) => {
    if (event.data.type === 'VTF_CHECK_STREAM') {
        window.postMessage({
            type: 'VTF_STREAM_STATUS',
            ready: !!window.__vtfCaptureStream,
            streamId: window.__vtfCaptureStream ? window.__vtfCaptureStream.id : null
        }, '*');
    }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectScript);
} else {
    injectScript();
}