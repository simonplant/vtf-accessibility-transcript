// background.js - Manages extension state and storage

// Extension state
let transcriptionState = {
    isActive: false,
    currentTab: null,
    transcripts: [],
    settings: {
        saveTranscripts: true,
        timestampFormat: '12h', // 12-hour format (not 24h)
        speakerLabels: true,
        autoStart: true  // Changed to true by default
    }
};

// Load saved settings
chrome.storage.local.get(['settings', 'transcripts'], (result) => {
    if (result.settings) {
        transcriptionState.settings = { ...transcriptionState.settings, ...result.settings };
    }
    if (result.transcripts) {
        transcriptionState.transcripts = result.transcripts;
    }
});

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
        case 'stream_ready':
            console.log('Background: Stream ready', request);
            // Update popup if open
            chrome.runtime.sendMessage({
                type: 'update_popup',
                data: {
                    streamReady: true,
                    trackCount: request.trackCount
                }
            });
            break;

        case 'transcription_status':
            transcriptionState.isActive = request.status === 'started';
            // Update icon
            updateIcon(transcriptionState.isActive);
            break;

        case 'transcription_result':
            handleTranscriptionResult(request, sender.tab);
            break;

        case 'interim_transcription':
            // Forward to popup for real-time display
            chrome.runtime.sendMessage({
                type: 'interim_update',
                transcript: request.transcript
            });
            break;

        case 'transcription_error':
            console.error('Background: Transcription error', request.error);
            chrome.runtime.sendMessage({
                type: 'error_update',
                error: request.error
            });
            break;

        case 'get_state':
            sendResponse(transcriptionState);
            break;

        case 'toggle_transcription':
            toggleTranscription(sender.tab || request.tab);
            break;

        case 'export_transcript':
            exportTranscript(sendResponse);
            return true; // Will respond asynchronously

        case 'clear_transcript':
            clearTranscript(sender.tab);
            break;

        case 'update_settings':
            updateSettings(request.settings);
            break;
    }
});

// Handle transcription results
function handleTranscriptionResult(data, tab) {
    const transcript = {
        text: data.transcript,
        timestamp: data.timestamp,
        confidence: data.confidence,
        tabId: tab.id,
        tabTitle: tab.title
    };

    // Add to state
    transcriptionState.transcripts.push(transcript);

    // Keep only last 1000 transcripts in memory
    if (transcriptionState.transcripts.length > 1000) {
        transcriptionState.transcripts = transcriptionState.transcripts.slice(-1000);
    }

    // Save to storage if enabled
    if (transcriptionState.settings.saveTranscripts) {
        saveTranscripts();
    }

    // Forward to popup
    chrome.runtime.sendMessage({
        type: 'new_transcript',
        transcript: transcript
    });
}

// Toggle transcription on/off
function toggleTranscription(tab) {
    if (!tab) return;

    transcriptionState.isActive = !transcriptionState.isActive;
    transcriptionState.currentTab = transcriptionState.isActive ? tab.id : null;

    chrome.tabs.sendMessage(tab.id, {
        type: transcriptionState.isActive ? 'start_transcription' : 'stop_transcription'
    });

    updateIcon(transcriptionState.isActive);
}

// Update extension icon
function updateIcon(isActive) {
    chrome.action.setBadgeText({ text: isActive ? 'REC' : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
}

// Save transcripts to storage
function saveTranscripts() {
    // Save only last 100 for storage efficiency
    const toSave = transcriptionState.transcripts.slice(-100);
    chrome.storage.local.set({ transcripts: toSave });
}

// Export transcript
function exportTranscript(sendResponse) {
    const transcripts = transcriptionState.transcripts;
    
    // Format transcripts
    let output = 'VTF Trading Floor Transcript\n';
    output += '==========================\n\n';
    
    let currentDate = '';
    transcripts.forEach(t => {
        const date = new Date(t.timestamp);
        const dateStr = date.toLocaleDateString('en-US', { 
            timeZone: 'America/New_York' 
        });
        
        if (dateStr !== currentDate) {
            currentDate = dateStr;
            output += `\n--- ${dateStr} ---\n\n`;
        }
        
        const timeStr = date.toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: transcriptionState.settings.timestampFormat === '12h'
        });
        output += `[${timeStr} ET] ${t.text}\n`;
    });

    // Create blob and download URL
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    // Download
    const date = new Date();
    const filename = `vtf-transcript-${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate().toString().padStart(2,'0')}.txt`;
    
    chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
    }, (downloadId) => {
        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        sendResponse({ success: true, filename: filename });
    });
}

// Clear transcript
function clearTranscript(tab) {
    transcriptionState.transcripts = [];
    chrome.storage.local.remove('transcripts');
    
    if (tab) {
        chrome.tabs.sendMessage(tab.id, { type: 'clear_transcript' });
    }
    
    chrome.runtime.sendMessage({ type: 'transcript_cleared' });
}

// Update settings
function updateSettings(newSettings) {
    transcriptionState.settings = { ...transcriptionState.settings, ...newSettings };
    chrome.storage.local.set({ settings: transcriptionState.settings });
}

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && 
        transcriptionState.currentTab === tabId &&
        transcriptionState.settings.autoStart) {
        // Re-inject if needed
        chrome.tabs.sendMessage(tabId, { type: 'ping' }, response => {
            if (!response) {
                // Content script not loaded, inject it
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content.js']
                });
            }
        });
    }
});

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
    if (transcriptionState.currentTab === tabId) {
        transcriptionState.isActive = false;
        transcriptionState.currentTab = null;
        updateIcon(false);
    }
});