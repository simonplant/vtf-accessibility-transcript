// options.js – UI logic for VTF Options page

// Set of option keys and their default values
const optionDefaults = {
    saveTranscripts: true,
    autoStart: true,
    speakerLabels: true,
    use24Hour: false,
    debugMode: false,
    apiKey: ""
};

function $(id) { return document.getElementById(id); }

function loadOptions() {
    chrome.storage.local.get(optionDefaults, (opts) => {
        $("saveTranscripts").checked = opts.saveTranscripts;
        $("autoStart").checked = opts.autoStart;
        $("speakerLabels").checked = opts.speakerLabels;
        $("use24Hour").checked = opts.use24Hour;
        $("debugMode").checked = opts.debugMode;
        $("apiKeyInput").value = opts.apiKey || "";
    });
}

function saveOptions() {
    const newOpts = {
        saveTranscripts: $("saveTranscripts").checked,
        autoStart: $("autoStart").checked,
        speakerLabels: $("speakerLabels").checked,
        use24Hour: $("use24Hour").checked,
        debugMode: $("debugMode").checked,
        apiKey: $("apiKeyInput").value
    };
    chrome.storage.local.set(newOpts, () => {
        const status = $("saveStatus");
        status.classList.add("show");
        setTimeout(() => status.classList.remove("show"), 1200);
    });
}

// Set up listeners
document.addEventListener("DOMContentLoaded", () => {
    loadOptions();
    for (const id of [
        "saveTranscripts", "autoStart", "speakerLabels",
        "use24Hour", "debugMode", "apiKeyInput"
    ]) {
        $(id).addEventListener("change", saveOptions);
        if (id === "apiKeyInput") {
            $(id).addEventListener("input", saveOptions);
        }
    }
});