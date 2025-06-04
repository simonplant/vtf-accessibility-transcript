// popup.js - Handles popup UI interactions

// DOM elements
const toggleBtn = document.getElementById('toggleBtn');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');
const settingsBtn = document.getElementById('settingsBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const audioSources = document.getElementById('audioSources');
const lineCount = document.getElementById('lineCount');
const transcriptContent = document.getElementById('transcriptContent');
const interimTranscript = document.getElementById('interimTranscript');
const errorMessage = document.getElementById('errorMessage');

// State
let isTranscribing = false;
let transcriptLines = [];
let vtfTab = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Get current tab - simple!
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    
    // Check if we're on VTF
    if (!currentTab.url || !currentTab.url.includes('vtf.t3live.com')) {
        showError('Please navigate to VTF (vtf.t3live.com)');
        toggleBtn.disabled = true;
        return;
    }
    
    vtfTab = currentTab;
    
    // Get current state
    chrome.runtime.sendMessage({ type: 'get_state' }, (state) => {
        if (state) {
            updateUI(state);
        }
    });
    
    // Check audio status
    checkAudioStatus();
});

// Button handlers
toggleBtn.addEventListener('click', () => {
    if (!vtfTab) {
        showError('No VTF tab found');
        return;
    }
    
    chrome.runtime.sendMessage({ 
        type: 'toggle_transcription',
        tab: vtfTab 
    });
    
    isTranscribing = !isTranscribing;
    updateToggleButton();
});

exportBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'export_transcript' }, (response) => {
        if (response && response.success) {
            showMessage(`Transcript exported: ${response.filename}`);
        }
    });
});

clearBtn.addEventListener('click', () => {
    if (confirm('Clear all transcripts? This cannot be undone.')) {
        chrome.runtime.sendMessage({ type: 'clear_transcript' });
        transcriptLines = [];
        updateTranscriptDisplay();
    }
});

settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        switch (request.type) {
            case 'update_popup':
                if (request.data.streamReady) {
                    audioSources.textContent = `${request.data.trackCount} audio source${request.data.trackCount > 1 ? 's' : ''} connected`;
                    audioSources.classList.add('success');
                }
                break;
                
            case 'new_transcript':
                addTranscriptLine(request.transcript);
                break;
                
            case 'interim_update':
                showInterimTranscript(request.transcript);
                break;
                
            case 'error_update':
                showError(request.error);
                break;
                
            case 'transcript_cleared':
                transcriptLines = [];
                updateTranscriptDisplay();
                showMessage('Transcript cleared');
                break;
        }
    } catch (error) {
        console.error('Error handling message:', error);
    }
});

// UI updates
function updateUI(state) {
    isTranscribing = state.isActive;
    transcriptLines = state.transcripts.slice(-50); // Show last 50 lines
    
    updateToggleButton();
    updateTranscriptDisplay();
}

function updateToggleButton() {
    if (isTranscribing) {
        toggleBtn.textContent = 'Stop Transcription';
        toggleBtn.classList.add('active');
        statusIndicator.classList.add('active');
        statusText.textContent = 'Recording';
        statusText.classList.add('danger');
        statusText.classList.remove('success');
    } else {
        toggleBtn.textContent = 'Start Transcription';
        toggleBtn.classList.remove('active');
        statusIndicator.classList.remove('active');
        statusText.textContent = 'Not Recording';
        statusText.classList.remove('danger');
        statusText.classList.add('success');
    }
}

function addTranscriptLine(transcript) {
    transcriptLines.push(transcript);
    
    // Keep only last 50 lines in popup
    if (transcriptLines.length > 50) {
        transcriptLines = transcriptLines.slice(-50);
    }
    
    updateTranscriptDisplay();
    hideInterimTranscript();
}

function updateTranscriptDisplay() {
    lineCount.textContent = transcriptLines.length;
    
    if (transcriptLines.length === 0) {
        transcriptContent.innerHTML = `
            <div class="empty-state">
                Click "Start Transcription" to begin capturing audio from the VTF trading floor.
            </div>
        `;
        return;
    }
    
    const html = transcriptLines.map(line => {
        const time = new Date(line.timestamp).toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
        return `
            <div class="transcript-entry">
                <div class="transcript-time">${time} ET</div>
                <div class="transcript-text">${escapeHtml(line.text)}</div>
            </div>
        `;
    }).join('');
    
    transcriptContent.innerHTML = html;
    
    // Scroll to bottom
    transcriptContent.scrollTop = transcriptContent.scrollHeight;
}

function showInterimTranscript(text) {
    if (text) {
        interimTranscript.textContent = text;
        interimTranscript.classList.remove('hidden');
    }
}

function hideInterimTranscript() {
    interimTranscript.classList.add('hidden');
}

function showError(error) {
    errorMessage.textContent = error.startsWith('Error:') ? error : `Error: ${error}`;
    errorMessage.classList.remove('hidden', 'success-message');
    
    // Don't auto-hide error messages
}

function showMessage(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('success-message');
    errorMessage.classList.remove('hidden');
    
    setTimeout(() => {
        errorMessage.classList.add('hidden');
        errorMessage.classList.remove('success-message');
    }, 3000);
}

// Check audio status
async function checkAudioStatus() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    
    if (!tab || !tab.url || !tab.url.includes('vtf.t3live.com')) {
        return;
    }
    
    try {
        chrome.tabs.sendMessage(tab.id, { type: 'check_audio' }, (response) => {
            if (chrome.runtime.lastError) {
                console.log('Content script not ready:', chrome.runtime.lastError.message);
                audioSources.textContent = 'Initializing...';
                audioSources.classList.remove('success');
                
                // Try to inject content script if it's not there
                if (chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    }, () => {
                        if (!chrome.runtime.lastError) {
                            console.log('Content script injected, retrying...');
                            setTimeout(checkAudioStatus, 1000);
                        }
                    });
                } else {
                    setTimeout(checkAudioStatus, 2000);
                }
            } else if (response && response.audioReady) {
                audioSources.textContent = 'Audio ready';
                audioSources.classList.add('success');
            } else {
                audioSources.textContent = 'Waiting for audio...';
                audioSources.classList.remove('success');
                setTimeout(checkAudioStatus, 2000);
            }
        });
    } catch (e) {
        console.error('Error checking audio:', e);
        audioSources.textContent = 'Error checking audio';
        audioSources.classList.remove('success');
    }
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Help and about links
document.getElementById('helpLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://github.com/yourusername/vtf-transcription/wiki' });
});

document.getElementById('aboutLink').addEventListener('click', (e) => {
    e.preventDefault();
    alert('VTF Audio Transcription Extension v1.0\n\nCaptures and transcribes audio from the VTF trading floor using OpenAI Whisper API.');
});