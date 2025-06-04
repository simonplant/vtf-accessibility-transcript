// content.js - Captures audio and sends to background for transcription (AudioWorkletNode version)
console.log('VTF Transcription: Content script loaded');

// State management
let isTranscribing = false;
let audioContext = null;
let workletNode = null;
let sourceNode = null;
let connectionCheckInterval;

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

// Set up audio processing using AudioWorkletNode
async function setupAudioProcessing() {
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });

    // Register audio processor
    await audioContext.audioWorklet.addModule(chrome.runtime.getURL('audio-processor.js'));
    workletNode = new AudioWorkletNode(audioContext, 'pcm-worklet-processor');
    workletNode.port.onmessage = (event) => {
        if (!isTranscribing) return;
        const pcmData = Array.from(event.data); // Use Array.from for safe cloning
        chrome.runtime.sendMessage({
            type: 'audio_data',
            data: pcmData
        });
    };

    window.addEventListener('message', (event) => {
        if (event.data.type === 'VTF_STREAM_DATA' && event.data.stream) {
            try {
                sourceNode = audioContext.createMediaStreamSource(event.data.stream);
                sourceNode.connect(workletNode);
                // No need to connect workletNode to destination (we don't want to play audio out)
                console.log('VTF Transcription: Audio pipeline connected (worklet)');
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

// Keep connection alive
function startConnectionCheck() {
    connectionCheckInterval = setInterval(() => {
        if (isTranscribing) {
            chrome.runtime.sendMessage({ type: 'heartbeat' }).catch(() => {
                console.log('VTF Transcription: Lost connection to background, attempting reconnect...');
                setTimeout(() => {
                    chrome.runtime.sendMessage({ type: 'transcription_status', status: 'started' });
                }, 1000);
            });
        }
    }, 30000);
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
        window.postMessage({ type: 'VTF_REQUEST_STREAM' }, '*');
        setupAudioProcessing();
        startConnectionCheck();
        chrome.runtime.sendMessage({ type: 'transcription_status', status: 'started' });
    }
}
function stopTranscription() {
    if (isTranscribing) {
        isTranscribing = false;
        console.log('VTF Transcription: Stopping...');
        stopConnectionCheck();
        if (sourceNode) sourceNode.disconnect();
        if (workletNode) workletNode.disconnect();
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        chrome.runtime.sendMessage({ type: 'transcription_status', status: 'stopped' });
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

// DOM ready: inject script
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectScript);
} else {
    injectScript();
}