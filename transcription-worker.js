// transcription-worker.js - LOCAL Vosk transcription with model caching
console.log('[Worker] Transcription worker starting...');

let recognizer = null;
let model = null;
let isReady = false;

// Cache model in IndexedDB to avoid reloading
async function cacheModel(arrayBuffer) {
    const db = await openDB();
    const tx = db.transaction(['models'], 'readwrite');
    await tx.objectStore('models').put(arrayBuffer, 'vosk-model');
    await tx.complete;
}

async function getCachedModel() {
    try {
        const db = await openDB();
        const tx = db.transaction(['models'], 'readonly');
        return await tx.objectStore('models').get('vosk-model');
    } catch (e) {
        return null;
    }
}

async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('VoskModels', 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('models')) {
                db.createObjectStore('models');
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e);
    });
}

// Initialize Vosk
async function initializeVosk() {
    try {
        console.log('[Worker] Initializing Vosk...');
        
        // Import Vosk
        const voskUrl = new URL('vosk.js', self.location.href).href;
        importScripts(voskUrl);
        
        // Check for cached model first
        let modelData = await getCachedModel();
        
        if (modelData) {
            console.log('[Worker] Using cached model');
            postMessage({ type: 'status', message: 'Using cached model...' });
        } else {
            console.log('[Worker] Downloading model...');
            postMessage({ type: 'status', message: 'Downloading model (40MB)...' });
            
            // Download model
            const modelUrl = new URL('vosk-model-small-en-us-0.15.zip', self.location.href).href;
            const response = await fetch(modelUrl);
            modelData = await response.arrayBuffer();
            
            // Cache for next time
            await cacheModel(modelData);
            console.log('[Worker] Model cached');
        }
        
        // Create model from data
        postMessage({ type: 'status', message: 'Loading model...' });
        model = await Vosk.createModel(modelData);
        
        // Create recognizer
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
    if (!isReady || !recognizer) return;
    
    try {
        const result = recognizer.acceptWaveform(audioData);
        
        if (result) {
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
    }
}

// Handle messages
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
            if (recognizer && model) {
                recognizer = new model.KaldiRecognizer(16000);
            }
            break;
            
        case 'final':
            if (recognizer) {
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
            
        case 'keepalive':
            // Just ignore keepalive messages
            break;
    }
});