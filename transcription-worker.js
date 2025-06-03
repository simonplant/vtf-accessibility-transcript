// transcription-worker.js - Runs Vosk in a Web Worker
importScripts('https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js');

let recognizer = null;
let model = null;
let isReady = false;

// Initialize Vosk
async function initializeVosk() {
    try {
        console.log('[Worker] Loading Vosk model...');
        postMessage({ type: 'status', message: 'Loading model (40MB)...' });
        
        // Load the model - this downloads once and caches
        model = await Vosk.createModel(
            'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip'
        );
        
        // Create recognizer with 16kHz sample rate
        recognizer = new model.KaldiRecognizer(16000);
        
        isReady = true;
        console.log('[Worker] Vosk ready!');
        postMessage({ type: 'ready' });
        
    } catch (error) {
        console.error('[Worker] Vosk init error:', error);
        postMessage({ type: 'error', error: error.message });
    }
}

// Process audio data
function processAudio(audioData) {
    if (!isReady || !recognizer) {
        console.warn('[Worker] Vosk not ready yet');
        return;
    }
    
    try {
        // Process the audio chunk
        const result = recognizer.acceptWaveform(audioData);
        
        if (result) {
            // Final result
            const resultJson = JSON.parse(recognizer.result());
            if (resultJson.text && resultJson.text.trim() !== '') {
                postMessage({
                    type: 'transcript',
                    text: resultJson.text,
                    isFinal: true,
                    timestamp: Date.now()
                });
            }
        } else {
            // Partial result
            const partialJson = JSON.parse(recognizer.partialResult());
            if (partialJson.partial && partialJson.partial.trim() !== '') {
                postMessage({
                    type: 'transcript',
                    text: partialJson.partial,
                    isFinal: false,
                    timestamp: Date.now()
                });
            }
        }
    } catch (error) {
        console.error('[Worker] Process error:', error);
        postMessage({ type: 'error', error: error.message });
    }
}

// Handle messages from main thread
self.addEventListener('message', async (event) => {
    const { type, data } = event.data;
    
    switch (type) {
        case 'init':
            await initializeVosk();
            break;
            
        case 'process':
            processAudio(data);
            break;
            
        case 'reset':
            if (recognizer) {
                // Reset recognizer for new session
                recognizer = new model.KaldiRecognizer(16000);
            }
            break;
            
        case 'final':
            if (recognizer) {
                // Get final result and reset
                const finalJson = JSON.parse(recognizer.finalResult());
                if (finalJson.text && finalJson.text.trim() !== '') {
                    postMessage({
                        type: 'transcript',
                        text: finalJson.text,
                        isFinal: true,
                        timestamp: Date.now()
                    });
                }
            }
            break;
    }
});

console.log('[Worker] Transcription worker loaded');