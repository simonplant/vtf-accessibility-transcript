// Clean, simple options.js
document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const toggleBtn = document.getElementById('toggleBtn');
  const saveBtn = document.getElementById('saveBtn');
  const clearBtn = document.getElementById('clearBtn');
  const status = document.getElementById('status');
  const debugMode = document.getElementById('debugMode');
  const autoStart = document.getElementById('autoStart');
  const bufferDuration = document.getElementById('bufferDuration');
  const bufferValue = document.getElementById('bufferValue');
  
  // Load saved settings
  const settings = await chrome.storage.local.get([
    'openaiApiKey',
    'debugMode', 
    'autoStart',
    'bufferDuration'
  ]);
  
  if (settings.openaiApiKey) {
    apiKeyInput.value = settings.openaiApiKey;
  }
  debugMode.checked = settings.debugMode || false;
  autoStart.checked = settings.autoStart !== false; // Default true
  bufferDuration.value = settings.bufferDuration || 1.5;
  bufferValue.textContent = `${bufferDuration.value}s`;
  
  // Toggle visibility
  toggleBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleBtn.textContent = 'Hide';
    } else {
      apiKeyInput.type = 'password';
      toggleBtn.textContent = 'Show';
    }
  });
  
  // Update buffer display
  bufferDuration.addEventListener('input', () => {
    bufferValue.textContent = `${bufferDuration.value}s`;
  });
  
  // Save settings
  saveBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showStatus('Please enter an API key', 'error');
      return;
    }
    
    if (!apiKey.startsWith('sk-')) {
      showStatus('Invalid API key format', 'error');
      return;
    }
    
    try {
      await chrome.storage.local.set({ 
        openaiApiKey: apiKey,
        debugMode: debugMode.checked,
        autoStart: autoStart.checked,
        bufferDuration: parseFloat(bufferDuration.value)
      });
      
      // Notify background script
      chrome.runtime.sendMessage({ 
        type: 'setApiKey', 
        apiKey: apiKey 
      });
      
      chrome.runtime.sendMessage({
        type: 'updateSettings',
        settings: {
          debugMode: debugMode.checked,
          autoStart: autoStart.checked,
          bufferDuration: parseFloat(bufferDuration.value)
        }
      });
      
      showStatus('Settings saved!', 'success');
    } catch (error) {
      showStatus('Failed to save settings', 'error');
    }
  });
  
  // Clear transcriptions
  clearBtn.addEventListener('click', async () => {
    if (confirm('Clear all transcription history?')) {
      await chrome.storage.local.remove('transcriptions');
      chrome.runtime.sendMessage({ type: 'clearTranscriptions' });
      showStatus('Transcriptions cleared', 'success');
    }
  });
  
  // Enter key saves
  apiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
  });
  
  function showStatus(message, type) {
    status.textContent = message;
    status.className = type;
    
    setTimeout(() => {
      status.className = '';
      status.textContent = '';
    }, 3000);
  }
});