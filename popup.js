// popup.js – Handles UI for VTF transcript viewing and controls

const $ = id => document.getElementById(id);

let debug = false;

function setStatus(running) {
    $("startBtn").disabled = running;
    $("stopBtn").disabled = !running;
}

function appendTranscript(text) {
    const el = $("transcript");
    el.textContent += text + "\n";
    el.scrollTop = el.scrollHeight;
}

function clearTranscript() {
    $("transcript").textContent = "";
}

function loadTranscript() {
    chrome.storage.local.get(["transcript"], (data) => {
        $("transcript").textContent = (data.transcript || "");
    });
}

function saveTranscript(txt) {
    chrome.storage.local.set({ transcript: txt });
}

$("startBtn").onclick = () => {
    setStatus(true);
    chrome.runtime.sendMessage({ type: "start_transcription" });
    if (debug) appendTranscript("[Debug] Transcription started.");
};
$("stopBtn").onclick = () => {
    setStatus(false);
    chrome.runtime.sendMessage({ type: "stop_transcription" });
    if (debug) appendTranscript("[Debug] Transcription stopped.");
};
$("clearBtn").onclick = () => {
    clearTranscript();
    saveTranscript("");
    if (debug) appendTranscript("[Debug] Transcript cleared.");
};

// Optional: debug mode in popup (syncs with settings)
$("debugPopup").addEventListener("change", e => {
    debug = $("debugPopup").checked;
    chrome.storage.local.set({ debugMode: debug });
});
chrome.storage.local.get("debugMode", data => {
    $("debugPopup").checked = !!data.debugMode;
    debug = !!data.debugMode;
});

// Listen for new transcript chunks from background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "transcript_chunk" && msg.text) {
        appendTranscript(msg.text);
        saveTranscript($("transcript").textContent);
    }
});

// Initial load
document.addEventListener("DOMContentLoaded", () => {
    loadTranscript();
    // (Optional) poll status to set running/stopped button
    chrome.runtime.sendMessage({ type: "get_transcription_status" }, res => {
        setStatus(res && res.isTranscribing);
    });
});