// options.js
document.addEventListener('DOMContentLoaded', function() {
    // Load current settings
    chrome.storage.local.get([
        'autoStart', 
        'saveTranscripts', 
        'showInterim',
        'timestampFormat',
        'showLevels',
        'debugMode'
    ], (data) => {
        document.getElementById('auto-start').checked = data.autoStart || false;
        document.getElementById('save-transcripts').checked = data.saveTranscripts !== false;
        document.getElementById('show-interim').checked = data.showInterim || false;
        document.getElementById('timestamp-format').checked = data.timestampFormat || false;
        document.getElementById('show-levels').checked = data.showLevels !== false;
        document.getElementById('debug-mode').checked = data.debugMode || false;
    });
    
    // Attach event listeners
    document.getElementById('saveBtn').addEventListener('click', saveSettings);
    document.getElementById('exportBtn').addEventListener('click', exportTranscripts);
    document.getElementById('clearBtn').addEventListener('click', clearAllData);
});

function saveSettings() {
    const settings = {
        autoStart: document.getElementById('auto-start').checked,
        saveTranscripts: document.getElementById('save-transcripts').checked,
        showInterim: document.getElementById('show-interim').checked,
        timestampFormat: document.getElementById('timestamp-format').checked,
        showLevels: document.getElementById('show-levels').checked,
        debugMode: document.getElementById('debug-mode').checked
    };
    
    chrome.storage.local.set(settings, () => {
        showStatus('Settings saved successfully!', 'success');
    });
}

function exportTranscripts() {
    chrome.storage.local.get(['transcripts'], (data) => {
        const transcripts = data.transcripts || [];
        if (transcripts.length === 0) {
            alert('No transcripts to export');
            return;
        }
        
        const content = transcripts.map(t => `[${t.timestamp}] ${t.text}`).join('\n\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vtf_transcripts_${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    });
}

function clearAllData() {
    if (confirm('This will delete all saved transcripts and reset all settings. Continue?')) {
        chrome.storage.local.clear(() => {
            showStatus('All data cleared', 'success');
            setTimeout(() => location.reload(), 1000);
        });
    }
}

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'status ' + type;
    setTimeout(() => {
        status.className = 'status';
    }, 3000);
}