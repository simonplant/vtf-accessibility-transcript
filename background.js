// background.js - Handles audio chunks, sends them to OpenAI Whisper API, relays results

const DEBUG = true;
function log(...args) { if (DEBUG) console.log('[VTF BG]', ...args); }

let apiKey = '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';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'audio_data') {
        log('Received audio chunk, length:', message.data.length);
        // Convert Float32Array to Int16 WAV
        const wavBuffer = floatToWav(message.data, 16000);
        transcribeWithWhisper(wavBuffer);
    }
    return true;
});

async function transcribeWithWhisper(wavBuffer) {
    log('Calling OpenAI Whisper...');
    try {
        const form = new FormData();
        form.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'audio.wav');
        form.append('model', 'whisper-1');
        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: form
        });
        const json = await res.json();
        log('Whisper result:', json);
        // TODO: Relay transcript to content/popup as needed
        // After successful transcription, send transcript to popup
        chrome.runtime.sendMessage({
            type: 'transcript_chunk',
            text: json.text, // replace with your actual transcript variable
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        log('Whisper failed:', err);
    }
}

// Helper: PCM32 to WAV
function floatToWav(float32Array, sampleRate) {
    const buffer = new ArrayBuffer(44 + float32Array.length * 2);
    const view = new DataView(buffer);
    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + float32Array.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);    // PCM chunk size
    view.setUint16(20, 1, true);     // PCM format
    view.setUint16(22, 1, true);     // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);     // Block align
    view.setUint16(34, 16, true);    // Bits per sample
    writeString(view, 36, 'data');
    view.setUint32(40, float32Array.length * 2, true);
    // PCM samples
    let offset = 44;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
}
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
}