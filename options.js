// options.js - Handle settings + API key

const saveTranscriptsToggle = document.getElementById('saveTranscripts');
const autoStartToggle = document.getElementById('autoStart');
const speakerLabelsToggle = document.getElementById('speakerLabels');
const use24HourToggle = document.getElementById('use24Hour');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveStatus = document.getElementById('saveStatus');

chrome.storage.local.get(['settings', 'openai_api_key'], (result) => {
    if (result.settings) {
        saveTranscriptsToggle.checked = result.settings.saveTranscripts !== false;
        autoStartToggle.checked = result.settings.autoStart !== false;
        speakerLabelsToggle.checked = result.settings.speakerLabels !== false;
        use24HourToggle.checked = result.settings.timestampFormat === '24h';
    } else {
        saveTranscriptsToggle.checked = true;
        autoStartToggle.checked = true;
        speakerLabelsToggle.checked = true;
        use24HourToggle.checked = false;
    }
    if (result.openai_api_key) {
        apiKeyInput.value = result.openai_api_key;
    }
});

function saveSettings() {
    const settings = {
        saveTranscripts: saveTranscriptsToggle.checked,
        autoStart: autoStartToggle.checked,
        speakerLabels: speakerLabelsToggle.checked,
        timestampFormat: use24HourToggle.checked ? '24h' : '12h'
    };

    const apiKey = apiKeyInput.value.trim();

    chrome.storage.local.set({ settings, openai_api_key: apiKey }, () => {
        chrome.runtime.sendMessage({ type: 'update_settings', settings });
        saveStatus.classList.add('show');
        setTimeout(() => saveStatus.classList.remove('show'), 2000);
    });
}

saveTranscriptsToggle.addEventListener('change', saveSettings);
autoStartToggle.addEventListener('change', saveSettings);
speakerLabelsToggle.addEventListener('change', saveSettings);
use24HourToggle.addEventListener('change', saveSettings);
apiKeyInput.addEventListener('input', saveSettings);
