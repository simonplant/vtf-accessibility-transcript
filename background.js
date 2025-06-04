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
        autoStart: false
    }
};

// Offscreen document for worker
let offscreenCreated = false;

// Create offscreen document
async function createOffscreenDocument() {
    if (offscreenCreated) {
        // Init existing document
        chrome.runtime.sendMessage({ type: 'init_worker' }).catch(() => {});
        return;
    }
    
    try {
        // Check if already exists
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT']
        });
        
        if (existingContexts.length > 0) {
            offscreenCreated = true;
            console.log('Background: Offscreen document already exists');
            chrome.runtime.sendMessage({ type: 'init_worker' }).catch(() => {});
            return;
        }
        
        // Create new
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Run speech recognition'
        });
        
        offscreenCreated = true;
        console.log('Background: Offscreen document created');
        
        // Initialize after a delay
        setTimeout(() => {
            chrome.runtime.sendMessage({ type: 'init_worker' }).catch(() => {});
        }, 1000);
        
    } catch (error) {
        console.error('Background: Failed to create offscreen document:', error);
    }
}

// Keep service worker alive
let keepAliveInterval;

function startKeepAlive() {
    keepAliveInterval = setInterval(() => {
        if (transcriptionState.isActive) {
            chrome.storage.local.get(['keepAlive'], () => {});
            if (offscreenCreated) {
                chrome.runtime.sendMessage({ type: 'keepalive' }).catch(() => {});
            }
        }
    }, 20000);
}

function stopKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}

// Initialize on startup
chrome.runtime.onStartup.addListener(() => {
    createOffscreenDocument();
});

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
            createOffscreenDocument();
            chrome.runtime.sendMessage({
                type: 'update_popup',
                data: {
                    streamReady: true,
                    trackCount: request.trackCount
                }
            }).catch(() => {});
            break;
            
        case 'audio_data':
            if (transcriptionState.isActive && offscreenCreated) {
                chrome.runtime.sendMessage({
                    type: 'process_audio',
                    data: request.data
                }).catch(() => {});
            }
            break;
            
        case 'worker_message':
            const { type, text, isFinal, error, message } = request.data;
            
            switch (type) {
                case 'ready':
                    console.log('Background: Speech recognition ready!');
                    if (transcriptionState.currentTab) {
                        chrome.tabs.sendMessage(transcriptionState.currentTab, {
                            type: 'worker_ready'
                        }).catch(() => {});
                    }
                    break;
                    
                case 'status':
                    console.log('Background: Worker status:', message);
                    break;
                    
                case 'transcript':
                    if (text.trim() !== '' && transcriptionState.currentTab) {
                        chrome.tabs.get(transcriptionState.currentTab, (tab) => {
                            if (!chrome.runtime.lastError && tab) {
                                handleTranscriptionResult({
                                    transcript: text,
                                    timestamp: Date.now(),
                                    confidence: 0.9,
                                    isFinal: isFinal
                                }, tab);
                            }
                        });
                    }
                    break;
                    
                case 'error':
                    console.error('Background: Worker error:', error);
                    chrome.runtime.sendMessage({
                        type: 'error_update',
                        error: error
                    }).catch(() => {});
                    break;
            }
            break;
            
        case 'worker_error':
            console.error('Background: Worker error:', request.error);
            chrome.runtime.sendMessage({
                type: 'error_update',
                error: request.error
            }).catch(() => {});
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
            }).catch(() => {});
            break;

        case 'get_state':
            sendResponse(transcriptionState);
            break;

        case 'toggle_transcription':
            toggleTranscription(sender.tab || request.tab);
            break;

        case 'export_transcript':
            exportTranscript(sendResponse);
            return true;

        case 'clear_transcript':
            clearTranscript(sender.tab);
            break;

        case 'update_settings':
            updateSettings(request.settings);
            break;
            
        case 'heartbeat':
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
        isFinal: data.isFinal,
        tabId: tab.id,
        tabTitle: tab.title
    };

    if (data.isFinal) {
        transcriptionState.transcripts.push(transcript);
        
        if (transcriptionState.transcripts.length > 1000) {
            transcriptionState.transcripts = transcriptionState.transcripts.slice(-1000);
        }
        
        if (transcriptionState.settings.saveTranscripts) {
            saveTranscripts();
        }
    }

    chrome.runtime.sendMessage({
        type: data.isFinal ? 'new_transcript' : 'interim_update',
        transcript: data.isFinal ? transcript : data.transcript
    }).catch(() => {});
}

// Toggle transcription on/off
function toggleTranscription(tab) {
    if (!tab) return;

    chrome.tabs.sendMessage(tab.id, { type: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
            console.log('Content script not loaded, injecting...');
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            }, () => {
                setTimeout(() => {
                    toggleTranscriptionInternal(tab);
                }, 500);
            });
        } else {
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
            createOffscreenDocument();
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
    const toSave = transcriptionState.transcripts.slice(-100);
    chrome.storage.local.set({ transcripts: toSave });
}

// Export transcript
function exportTranscript(sendResponse) {
    const transcripts = transcriptionState.transcripts;
    
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

    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const date = new Date();
    const filename = `vtf-transcript-${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate().toString().padStart(2,'0')}.txt`;
    
    chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
    }, (downloadId) => {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        sendResponse({ success: true, filename: filename });
    });
}

// Clear transcript
function clearTranscript(tab) {
    transcriptionState.transcripts = [];
    chrome.storage.local.remove('transcripts');
    
    if (tab) {
        chrome.tabs.sendMessage(tab.id, { type: 'clear_transcript' }).catch(() => {});
    }
    
    chrome.runtime.sendMessage({ type: 'transcript_cleared' }).catch(() => {});
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
        chrome.tabs.sendMessage(tabId, { type: 'ping' }, response => {
            if (!response) {
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

// On install/update
chrome.runtime.onInstalled.addListener((details) => {
    createOffscreenDocument();
    
    if (details.reason === 'update' || details.reason === 'install') {
        chrome.tabs.query({ url: 'https://vtf.t3live.com/*' }, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.reload(tab.id);
            });
        });
    }
});