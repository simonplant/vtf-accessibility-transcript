// popup.js - Enhanced UI handlers

const $ = id => document.getElementById(id);

let isTranscribing = false;
let transcriptLines = 0;

// UI Update Functions
function updateStatus(active) {
    isTranscribing = active;
    const indicator = $("statusIndicator");
    const statusText = $("statusText");
    const toggleBtn = $("toggleBtn");
    
    if (active) {
        indicator.classList.add("active");
        statusText.textContent = "Recording";
        statusText.className = "info-value danger";
        toggleBtn.textContent = "Stop Transcription";
        toggleBtn.classList.add("active");
    } else {
        indicator.classList.remove("active");
        statusText.textContent = "Not Recording";
        statusText.className = "info-value";
        toggleBtn.textContent = "Start Transcription";
        toggleBtn.classList.remove("active");
    }
}

function updateAudioSources(sources) {
    const sourcesEl = $("audioSources");
    if (sources && sources.length > 0) {
        sourcesEl.textContent = `${sources.length} active`;
        sourcesEl.className = "info-value success";
    } else {
        sourcesEl.textContent = "None detected";
        sourcesEl.className = "info-value danger";
    }
}

function showError(message) {
    const errorEl = $("errorMessage");
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
    setTimeout(() => errorEl.classList.add("hidden"), 5000);
}

function addTranscriptEntry(text, timestamp) {
    const content = $("transcriptContent");
    
    // Remove empty state
    if (content.querySelector(".empty-state")) {
        content.innerHTML = "";
    }
    
    // Create new entry
    const entry = document.createElement("div");
    entry.className = "transcript-entry";
    
    const time = document.createElement("div");
    time.className = "transcript-time";
    time.textContent = new Date(timestamp).toLocaleTimeString();
    
    const textEl = document.createElement("div");
    textEl.className = "transcript-text";
    textEl.textContent = text;
    
    entry.appendChild(time);
    entry.appendChild(textEl);
    content.appendChild(entry);
    
    // Update count
    transcriptLines++;
    $("lineCount").textContent = transcriptLines;
    
    // Auto-scroll
    content.scrollTop = content.scrollHeight;
}

function clearTranscript() {
    $("transcriptContent").innerHTML = '<div class="empty-state">Click "Start Transcription" to begin capturing audio from the VTF trading floor.</div>';
    transcriptLines = 0;
    $("lineCount").textContent = "0";
}

// Button Handlers
$("toggleBtn").onclick = async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab.url.includes("vtf.t3live.com")) {
            showError("Please navigate to VTF trading floor first");
            return;
        }
        
        if (isTranscribing) {
            chrome.tabs.sendMessage(tab.id, { type: "stop_transcription" });
            updateStatus(false);
        } else {
            chrome.tabs.sendMessage(tab.id, { type: "start_transcription" });
            updateStatus(true);
        }
    } catch (err) {
        showError("Failed to toggle transcription: " + err.message);
    }
};

$("clearBtn").onclick = () => {
    clearTranscript();
    chrome.storage.local.set({ transcript: "" });
};

$("exportBtn").onclick = () => {
    const entries = document.querySelectorAll(".transcript-entry");
    let text = "VTF Transcript Export\n" + new Date().toLocaleString() + "\n\n";
    
    entries.forEach(entry => {
        const time = entry.querySelector(".transcript-time").textContent;
        const content = entry.querySelector(".transcript-text").textContent;
        text += `[${time}] ${content}\n\n`;
    });
    
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
        url: url,
        filename: `vtf-transcript-${Date.now()}.txt`
    });
};

$("settingsBtn").onclick = () => {
    chrome.runtime.openOptionsPage();
};

// Message Handlers
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "transcript_chunk") {
        addTranscriptEntry(msg.text, msg.timestamp || Date.now());
    }
    if (msg.type === "audio_sources_update") {
        updateAudioSources(msg.sources);
    }
    if (msg.type === "transcription_error") {
        showError(msg.error);
    }
});

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
    // Check current status
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: "get_status" }, response => {
            if (response && response.isTranscribing) {
                updateStatus(true);
            }
        });
    }
    
    // Load saved transcript
    chrome.storage.local.get(["transcript"], (data) => {
        if (data.transcript) {
            // Parse and display saved transcript
            // Implementation depends on how you store it
        }
    });
});