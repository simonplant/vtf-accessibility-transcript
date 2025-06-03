// options.js - Handle settings page

// DOM elements
const saveTranscriptsToggle = document.getElementById('saveTranscripts');
const autoStartToggle = document.getElementById('autoStart');
const speakerLabelsToggle = document.getElementById('speakerLabels');
const use24HourToggle = document.getElementById('use24Hour');
const saveStatus = document.getElementById('saveStatus');

// Load current settings
chrome.storage.local.get(['settings'], (result) => {
    if (result.settings) {
        // Apply saved settings
        saveTranscriptsToggle.checked = result.settings.saveTranscripts !== false; // Default true
        autoStartToggle.checked = result.settings.autoStart !== false; // Default true
        speakerLabelsToggle.checked = result.settings.speakerLabels !== false; // Default true
        use24HourToggle.checked = result.settings.timestampFormat === '24h'; // Default false (12h)
    } else {
        // Apply defaults matching background.js
        saveTranscriptsToggle.checked = true;
        autoStartToggle.checked = true;
        speakerLabelsToggle.checked = true;
        use24HourToggle.checked = false; // 12h format by default
    }
});

// Save settings on change
function saveSettings() {
    const settings = {
        saveTranscripts: saveTranscriptsToggle.checked,
        autoStart: autoStartToggle.checked,
        speakerLabels: speakerLabelsToggle.checked,
        timestampFormat: use24HourToggle.checked ? '24h' : '12h'
    };
    
    chrome.storage.local.set({ settings }, () => {
        // Notify background script
        chrome.runtime.sendMessage({
            type: 'update_settings',
            settings: settings
        });
        
        // Show save confirmation
        saveStatus.classList.add('show');
        setTimeout(() => {
            saveStatus.classList.remove('show');
        }, 2000);
    });
}

// Add event listeners
saveTranscriptsToggle.addEventListener('change', saveSettings);
autoStartToggle.addEventListener('change', saveSettings);
speakerLabelsToggle.addEventListener('change', saveSettings);
use24HourToggle.addEventListener('change', saveSettings);