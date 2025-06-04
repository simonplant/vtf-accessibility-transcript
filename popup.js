// popup.js - Simple UI, live transcript, debug button
const DEBUG = true;
function log(...args) { if (DEBUG) console.log('[VTF Popup]', ...args); }

function updateTranscript(text) {
    document.getElementById('transcript').textContent = text || "(nothing yet)";
}

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'new_transcript') updateTranscript(msg.text);
});

document.getElementById('startBtn').onclick = () => {
    chrome.runtime.sendMessage({ type: 'start_transcription' });
};
document.getElementById('stopBtn').onclick = () => {
    chrome.runtime.sendMessage({ type: 'stop_transcription' });
};
document.getElementById('refreshBtn').onclick = () => {
    chrome.runtime.sendMessage({ type: 'get_transcript' }, (resp) => {
        updateTranscript(resp.text);
    });
};

chrome.runtime.sendMessage({ type: 'get_transcript' }, (resp) => {
    updateTranscript(resp.text);
});