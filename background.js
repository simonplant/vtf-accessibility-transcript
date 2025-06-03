// background.js - Manages extension state and storage

// Extension state
let transcriptionState = {
    isActive: false,
    currentTab: null,
    transcripts: [],
    settings: {
        saveTranscripts: true,
        timestampFormat: '12h',
        speakerLabels: true,
        autoStart: true
    }
};

// Offscreen document for worker
let offscreenCreated = false;
let keepAliveInterval;

// Create offscreen document
async function createOffscreenDocument() {
    if (offscreenCreated) return;
    
    try {
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Run Vosk transcription worker'
        });
        offscreenCreated = true;
        console.log('Background: Offscreen document created');
    } catch (error) {
        if (error.message.includes('already exists')) {
            offscreenCreated = true;
        } else {
            console.error('Background: Failed to create offscreen document:', error);
        }
    }
}

// Keep service worker alive
function startKeepAlive() {
    // Ping every 20 seconds to prevent service worker suspension
    keepAliveInterval = setInterval(async () => {
        if (transcriptionState.isActive) {
            // Keep the service worker active
            chrome.storage.local.get(['keepAlive'], () => {
                // Just accessing storage keeps it alive
            });
            
            // Check if offscreen document is still alive
            try {
                const contexts = await chrome.runtime.getContexts({
                    contextTypes: ['OFFSCREEN_DOCUMENT']
                });
                
                if (contexts.length === 0) {
                    console.log('Background: Offscreen document terminated, recreating...');
                    offscreenCreated = false;
                    await createOffscreenDocument();
                }
            } catch (error) {
                console.error('Background: Error checking offscreen document:', error);
            }
        }
    }, 20000); // Every 20 seconds
}

function stopKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}

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
            // Create offscreen document if needed
            createOffscreenDocument();
            // Update popup if open - with error handling
            chrome.runtime.sendMessage({
                type: 'update_popup',
                data: {
                    streamReady: true,
                    trackCount: request.trackCount
                }
            }).catch(() => {
                // Popup not open, ignore
            });
            break;
            
        case 'audio_data':
            // Forward audio data to offscreen document
            if (transcriptionState.isActive && offscreenCreated) {
                // Send to all contexts (offscreen will receive it)
                chrome.runtime.sendMessage({
                    type: 'process_audio',
                    data: request.data
                }).catch(() => {
                    // Offscreen might not be ready
                });
            }
            break;
            
        case 'worker_message':
            // Handle messages from worker via offscreen document
            const { type, text, isFinal, error, message } = request.data;
            
            switch (type) {
                case 'ready':
                    console.log('Background: Vosk ready!');
                    if (transcriptionState.currentTab) {
                        chrome.tabs.sendMessage(transcriptionState.currentTab, {
                            type: 'worker_ready'
                        });
                    }
                    break;
                    
                case 'status':
                    console.log('Background: Worker status:', message);
                    break;
                    
                case 'transcript':
                    if (isFinal && text.trim() !== '' && transcriptionState.currentTab) {
                        chrome.tabs.get(transcriptionState.currentTab, (tab) => {
                            if (!chrome.runtime.lastError && tab) {
                                handleTranscriptionResult({
                                    transcript: text,
                                    timestamp: Date.now(),
                                    confidence: 0.9
                                }, tab);
                            }
                        });
                    } else if (!isFinal && text.trim() !== '') {
                        chrome.runtime.sendMessage({
                            type: 'interim_update',
                            transcript: text
                        }).catch(() => {
                            // Popup might be closed
                        });
                    }
                    break;
                    
                case 'error':
                    console.error('Background: Worker error:', error);
                    chrome.runtime.sendMessage({
                        type: 'error_update',
                        error: error
                    }).catch(() => {
                        // Popup might be closed
                    });
                    break;
            }
            break;
            
        case 'worker_error':
            console.error('Background: Worker error:', request.error);
            chrome.runtime.sendMessage({
                type: 'error_update',
                error: request.error
            }).catch(() => {
                // Popup might be closed
            });
            break;

        case 'transcription_status':
            transcriptionState.isActive = request.status === 'started';
            updateIcon(transcriptionState.isActive);
            break;

        case 'transcription_error':
            console.error('Background: Transcription error', request.error);
            chrome.runtime.sendMessage({
                type: 'error_update',
                error: request.error
            }).catch(() => {
                // Popup might be closed
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
            
        case 'heartbeat':
            // Just acknowledge the heartbeat
            sendResponse({ alive: true });
            break;
    }
    
    return false;
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
    }).catch(() => {
        // Popup might be closed
    });
}

// Toggle transcription on/off
function toggleTranscription(tab) {
    if (!tab) return;

    // First check if content script is loaded
    chrome.tabs.sendMessage(tab.id, { type: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
            console.log('Content script not loaded, injecting...');
            // Inject content script
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            }, () => {
                // After injection, toggle transcription
                setTimeout(() => {
                    toggleTranscriptionInternal(tab);
                }, 500);
            });
        } else {
            // Content script is loaded, proceed
            toggleTranscriptionInternal(tab);
        }
    });
}

function toggleTranscriptionInternal(tab) {
    transcriptionState.isActive = !transcriptionState.isActive;
    transcriptionState.currentTab = transcriptionState.isActive ? tab.id : null;

    chrome.tabs.sendMessage(tab.id, {
        type: transcriptionState.isActive ? 'start_transcription' : 'stop_transcription'
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Failed to toggle transcription:', chrome.runtime.lastError);
            transcriptionState.isActive = false;
            transcriptionState.currentTab = null;
        } else if (transcriptionState.isActive) {
            startKeepAlive();
        } else {
            stopKeepAlive();
        }
    });

    updateIcon(transcriptionState.isActive);
}

// Update extension icon
function updateIcon(isActive) {
    if (isActive) {
        chrome.action.setBadgeText({ text: 'REC' });
        chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
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
    
    chrome.runtime.sendMessage({ type: 'transcript_cleared' }).catch(() => {
        // Popup might be closed
    });
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
        stopKeepAlive();
    }
});

// On install/update, reload VTF tabs to prevent orphaned content scripts
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'update' || details.reason === 'install') {
        // Find and reload VTF tabs
        chrome.tabs.query({ url: 'https://vtf.t3live.com/*' }, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.reload(tab.id);
            });
        });
    }
});