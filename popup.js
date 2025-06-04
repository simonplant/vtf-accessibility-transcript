// popup.js - Popup UI controller

const $ = id => document.getElementById(id);

let isTranscribing = false;
let currentTabId = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;
  
  // Check if on VTF site
  if (!tab.url.includes('vtf.t3live.com')) {
    showError('Please navigate to VTF trading floor first');
    $('toggleBtn').disabled = true;
    return;
  }
  
  // Get current status
  chrome.tabs.sendMessage(tab.id, { type: 'get_status' }, (response) => {
    if (chrome.runtime.lastError) {
      showError('Unable to connect to VTF page. Please refresh.');
      return;
    }
    
    if (response) {
      updateStatus(response.isTranscribing);
      updateAudioStatus(response.hasAudioStream);
    }
  });
  
  // Load saved transcripts
  loadTranscripts();
  
  // Check API key
  chrome.storage.local.get(['apiKey'], (result) => {
    if (!result.apiKey) {
      showError('Please set your OpenAI API key in settings');
    }
  });
});

// Button handlers
$('toggleBtn').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (isTranscribing) {
    chrome.tabs.sendMessage(tab.id, { type: 'stop_transcription' }, (response) => {
      if (response && response.success) {
        updateStatus(false);
      }
    });
  } else {
    chrome.tabs.sendMessage(tab.id, { type: 'start_transcription' }, (response) => {
      if (response && response.success) {
        updateStatus(true);
        if (!response.hasAudioStream) {
          showError('No audio stream detected. Waiting for audio...');
        }
      }
    });
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
  const key = `transcript_${currentTabId}`;
  const { [key]: transcripts = [] } = await chrome.storage.local.get(key);
  
  if (transcripts.length === 0) {
    showError('No transcripts to export');
    return;
  }
  
  let content = 'VTF Trading Floor Transcript\n';
  content += `Exported: ${new Date().toLocaleString()}\n`;
  content += '=' .repeat(50) + '\n\n';
  
  transcripts.forEach(entry => {
    const time = new Date(entry.date).toLocaleTimeString();
    content += `[${time}] ${entry.text}\n\n`;
  });
  
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const filename = `vtf-transcript-${new Date().toISOString().split('T')[0]}.txt`;
  
  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: true
  });
};

$('settingsBtn').onclick = () => {
  chrome.runtime.openOptionsPage();
};

// UI update functions
function updateStatus(active) {
  isTranscribing = active;
  const indicator = $('statusIndicator');
  const statusText = $('statusText');
  const toggleBtn = $('toggleBtn');
  
  if (active) {
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

function updateAudioStatus(hasAudio) {
  const audioStatus = $('audioSources');
  if (hasAudio) {
    audioStatus.textContent = 'Audio stream detected';
    audioStatus.className = 'info-value success';
  } else {
    audioStatus.textContent = 'No audio detected';
    audioStatus.className = 'info-value danger';
  }
}

function updateLineCount(count) {
  $('lineCount').textContent = count;
}

function showError(message) {
  const errorEl = $('errorMessage');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
  setTimeout(() => errorEl.classList.add('hidden'), 5000);
}

function addTranscriptLine(text, timestamp) {
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
  const currentCount = content.querySelectorAll('.transcript-entry').length;
  updateLineCount(currentCount);
  
  // Auto-scroll
  content.scrollTop = content.scrollHeight;
}

async function loadTranscripts() {
  const key = `transcript_${currentTabId}`;
  const { [key]: transcripts = [] } = await chrome.storage.local.get(key);
  
  if (transcripts.length > 0) {
    $('transcriptContent').innerHTML = '';
    // Show last 50 entries
    const recent = transcripts.slice(-50);
    recent.forEach(entry => {
      addTranscriptLine(entry.text, entry.date);
    });
  }
}

// Listen for transcript updates
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'transcript_update':
      if (message.tabId === currentTabId) {
        addTranscriptLine(message.text, message.timestamp);
      }
      break;
      
    case 'transcription_error':
      showError(message.error);
      break;
      
    case 'stream_status':
      updateAudioStatus(message.hasAudio);
      break;
  }
});