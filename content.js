// Inject the audio capture script into the page
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() { this.remove(); };
(document.head || document.documentElement).appendChild(script);

// content.js – VTF Transcription Content Script (robust MV3, MutationObserver compatible)
console.log('[VTF Transcription] Content script loaded');

// Extension state
let isTranscribing = false;
let audioContext = null;
let sourceNode = null;
let audioProcessor = null;
let silenceCheckInterval = null;
let audioBuffer = [];
const BUFFER_SIZE = 16000 * 5; // 5 seconds at 16kHz

// Service Worker safe sendMessage (with auto-retry)
function sendToBackground(payload, retries = 3) {
    chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
            if (
                chrome.runtime.lastError.message &&
                chrome.runtime.lastError.message.includes('Extension context invalidated') &&
                retries > 0
            ) {
                setTimeout(() => sendToBackground(payload, retries - 1), 400);
            } else {
                console.error('[VTF Transcription] sendMessage failed:', chrome.runtime.lastError);
            }
        }
    });
}

// Listen for stream hooks from inject.js
window.addEventListener('message', async (event) => {
    if (event.data && event.data.type === 'VTF_STREAM_HOOKED') {
        console.log('[VTF Transcription] Notified: stream hooked!');
        setTimeout(setupAudioProcessing, 200);
    }
});

// Setup audio capture pipeline
async function setupAudioProcessing() {
    try {
        // Cleanup any old context/processors
        if (audioContext) {
            try { audioContext.close(); } catch (e) {}
        }
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });

        // Try to get the injected stream
        const injectedStream = window.__vtfCaptureStream;
        if (!injectedStream) {
            console.warn('[VTF Transcription] No injected stream available, waiting...');
            return;
        }

        // Setup nodes
        if (sourceNode) try { sourceNode.disconnect(); } catch (e) {}
        if (audioProcessor) try { audioProcessor.disconnect(); } catch (e) {}

        sourceNode = audioContext.createMediaStreamSource(injectedStream);

        // ScriptProcessorNode (still needed for browser compat—AudioWorklet is better if supported!)
        audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);

        audioProcessor.onaudioprocess = (e) => {
            if (!isTranscribing) return;
            const input = e.inputBuffer.getChannelData(0);
            audioBuffer.push(...input);

            // Send every 5 seconds
            if (audioBuffer.length >= BUFFER_SIZE) {
                sendToBackground({ 
                    type: 'audio_data', 
                    data: audioBuffer.slice(0, BUFFER_SIZE)
                });
                audioBuffer = audioBuffer.slice(BUFFER_SIZE);
            }
        };

        sourceNode.connect(audioProcessor);
        audioProcessor.connect(audioContext.destination);

        console.log('[VTF Transcription] Audio pipeline ready!');

        // Start transcribing immediately for this stream
        isTranscribing = true;
    } catch (e) {
        console.error('[VTF Transcription] setupAudioProcessing failed:', e);
        sendToBackground({ type: 'transcription_error', error: String(e) });
    }
}

// Chrome messages for control (popup/worker)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'start_transcription') {
        isTranscribing = true;
        setupAudioProcessing();
        sendResponse({ started: true });
    }
    if (msg.type === 'stop_transcription') {
        isTranscribing = false;
        if (audioProcessor) try { audioProcessor.disconnect(); } catch (e) {}
        if (sourceNode) try { sourceNode.disconnect(); } catch (e) {}
        if (audioContext) try { audioContext.close(); } catch (e) {}
        sendResponse({ stopped: true });
    }
    return true;
});

// Expose (for debug)
window.__vtfRestart = setupAudioProcessing;