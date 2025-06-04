// offscreen.js - Whisper transcription with hardcoded API key

// offscreen.js - Whisper transcription with hardcoded API key & silence detection

const WHISPER_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_API_KEY = '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'; // HARD-CODED API KEY (do not commit to source control)

let audioBuffer = [];
let bufferStart = null;
const CHUNK_DURATION_MS = 5000;
const MIN_INTERVAL_MS = 7000;
let lastSentAt = 0;

// Silence detection: parameters
const SILENCE_THRESHOLD = 0.015; // Min amplitude to count as 'loud'
const MIN_LOUD_FRAMES = 128;     // How many samples must be loud to consider 'not silent'

// Utility: check if buffer is mostly silence
function isMostlySilent(float32Array, threshold = SILENCE_THRESHOLD, minLoud = MIN_LOUD_FRAMES) {
    let loud = 0;
    for (let i = 0; i < float32Array.length; i++) {
        if (Math.abs(float32Array[i]) > threshold) {
            loud++;
            if (loud >= minLoud) return false; // It's NOT silent!
        }
    }
    return true; // Is mostly silence
}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.type === 'init_worker') return sendResponse({ status: 'ready' });
    if (request.type === 'keepalive') return sendResponse({ ok: true });
    if (request.type !== 'process_audio' || !OPENAI_API_KEY) return;

    audioBuffer.push(...request.data);
    if (!bufferStart) bufferStart = Date.now();

    if (Date.now() - bufferStart >= CHUNK_DURATION_MS && Date.now() - lastSentAt >= MIN_INTERVAL_MS) {
        // Silence detection step
        if (isMostlySilent(audioBuffer)) {
            // Too quiet: skip this chunk
            audioBuffer = [];
            bufferStart = null;
            // Optionally: send a "no speech" event for UI (optional)
            chrome.runtime.sendMessage({
                type: 'worker_message',
                data: { type: 'transcript', text: '[silence]', isFinal: true }
            });
            return;
        }

        const blob = encodeWAV(audioBuffer);
        audioBuffer = [];
        bufferStart = null;
        lastSentAt = Date.now();

        try {
            const transcript = await sendToWhisper(blob);
            chrome.runtime.sendMessage({
                type: 'worker_message',
                data: { type: 'transcript', text: transcript, isFinal: true }
            });
        } catch (err) {
            chrome.runtime.sendMessage({
                type: 'worker_message',
                data: { type: 'error', error: err.message || 'Whisper failed' }
            });
        }
    }
});

function encodeWAV(float32Array) {
    const sampleRate = 16000;
    const buffer = new ArrayBuffer(44 + float32Array.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset, str) => str.split('').forEach((s, i) => view.setUint8(offset + i, s.charCodeAt(0)));

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + float32Array.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, float32Array.length * 2, true);

    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
}

async function sendToWhisper(blob) {
    const form = new FormData();
    form.append('file', blob, 'chunk.wav');
    form.append('model', 'whisper-1');
    form.append('language', 'en');

    const res = await fetch(WHISPER_ENDPOINT, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: form
    });

    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    return json.text;
}