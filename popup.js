// popup.js - Production UI with real-time status
const $ = id => document.getElementById(id);

let currentTabId = null;
let statusUpdateInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;
  
  // Check if on VTF site
  if (!tab.url || !tab.url.includes('vtf.t3live.com')) {
    showError('Please navigate to VTF trading floor first');
    $('toggleBtn').disabled = true;
    return;
  }
  
  // Check API key
  const apiStatus = await chrome.runtime.sendMessage({ type: 'get_api_status' });
  if (!apiStatus.hasApiKey) {
    showError('Please set your OpenAI API key in settings');
  }
  
  // Get initial status
  getStatus();
  
  // Start status updates
  statusUpdateInterval = setInterval(getStatus, 2000);
  
  // Load transcripts
  loadTranscripts();
});

// Get current status
async function getStatus() {
  try {
    const response = await chrome.tabs.sendMessage(currentTabId, { type: 'get_status' });
    
    if (response) {
      updateUI(response.isTranscribing);
      updateStats(response.stats);
    }
  } catch (error) {
    console.error('Failed to get status:', error);
  }
}

// Update UI based on transcription state
function updateUI(isTranscribing) {
  const indicator = $('statusIndicator');
  const statusText = $('statusText');
  const toggleBtn = $('toggleBtn');
  
  if (isTranscribing) {
    indicator.classList.add('active');
    statusText.textContent = 'Recording';
    statusText.className = 'info-value danger';
    toggleBtn.textContent = 'Stop Transcription';
    toggleBtn.classList.add('active');
  } else {
    indicator.classList.remove('active');
    statusText.textContent = 'Not Recording';
    statusText.className = 'info-value';
    toggleBtn.textContent = 'Start Transcription';
    toggleBtn.classList.remove('active');
  }
}

// Update statistics
function updateStats(stats) {
  if (!stats) return;
  
  $('chunksReceived').textContent = stats.chunksReceived || 0;
  $('chunksSent').textContent = stats.chunksSent || 0;
  $('errors').textContent = stats.errors || 0;
  
  if (stats.lastActivity) {
    const secondsAgo = Math.floor((Date.now() - stats.lastActivity) / 1000);
    $('lastActivity').textContent = `${secondsAgo}s ago`;
  }
}

// Button handlers
$('toggleBtn').onclick = async () => {
  const btn = $('toggleBtn');
  const isTranscribing = btn.classList.contains('active');
  
  btn.disabled = true;
  
  try {
    const response = await chrome.tabs.sendMessage(currentTabId, {
      type: isTranscribing ? 'stop_transcription' : 'start_transcription'
    });
    
    if (response && response.success) {
      updateUI(!isTranscribing);
    }
  } catch (error) {
    showError('Failed to toggle transcription');
  } finally {
    btn.disabled = false;
  }
};

$('clearBtn').onclick = () => {
  if (confirm('Clear all transcripts?')) {
    $('transcriptContent').innerHTML = '<div class="empty-state">No transcripts yet</div>';
    chrome.storage.local.remove(`transcript_${currentTabId}`);
    updateLineCount(0);
  }
};

$('exportBtn').onclick = async () => {
  try {
    const content = await chrome.runtime.sendMessage({
      type: 'export_transcripts',
      tabId: currentTabId
    });
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const filename = `vtf-transcript-${new Date().toISOString().split('T')[0]}.txt`;
    
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });
  } catch (error) {
    showError('Failed to export transcripts');
  }
};

$('settingsBtn').onclick = () => {
  chrome.runtime.openOptionsPage();
};

// Show error message
function showError(message) {
  const errorEl = $('errorMessage');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
  setTimeout(() => errorEl.classList.add('hidden'), 5000);
}

// Add transcript entry
function addTranscriptEntry(text, timestamp) {
  const content = $('transcriptContent');
  
  // Remove empty state
  if (content.querySelector('.empty-state')) {
    content.innerHTML = '';
  }
  
  const entry = document.createElement('div');
  entry.className = 'transcript-entry';
  
  const time = document.createElement('div');
  time.className = 'transcript-time';
  time.textContent = new Date(timestamp).toLocaleTimeString();
  
  const textEl = document.createElement('div');
  textEl.className = 'transcript-text';
  textEl.textContent = text;
  
  entry.appendChild(time);
  entry.appendChild(textEl);
  content.appendChild(entry);
  
  // Update count
  updateLineCount(content.querySelectorAll('.transcript-entry').length);
  
  // Auto-scroll
  content.scrollTop = content.scrollHeight;
}

// Update line count
function updateLineCount(count) {
  $('lineCount').textContent = count;
}

// Load saved transcripts
async function loadTranscripts() {
  const key = `transcript_${currentTabId}`;
  const result = await chrome.storage.local.get(key);
  const transcripts = result[key] || [];
  
  if (transcripts.length > 0) {
    $('transcriptContent').innerHTML = '';
    
    // Show last 50 entries
    const recent = transcripts.slice(-50);
    recent.forEach(entry => {
      addTranscriptEntry(entry.text, entry.timestamp);
    });
  }
}

// Listen for updates
chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'transcript_update':
      if (message.tabId === currentTabId) {
        addTranscriptEntry(message.text, message.timestamp);
      }
      break;
      
    case 'transcription_error':
      showError(`Transcription error: ${message.error}`);
      break;
      
    case 'error':
      showError(`${message.context}: ${message.message}`);
      break;
      
    case 'stream_status':
      const streamStatus = $('streamStatus');
      if (message.status === 'connected') {
        streamStatus.textContent = `Connected: ${message.sourceId}`;
        streamStatus.className = 'info-value success';
      } else {
        streamStatus.textContent = 'No active stream';
        streamStatus.className = 'info-value';
      }
      break;
  }
});

// Cleanup
window.addEventListener('unload', () => {
  if (statusUpdateInterval) {
    clearInterval(statusUpdateInterval);
  }
});