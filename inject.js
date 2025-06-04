// inject.js – VTF Audio Capture via MutationObserver
console.log('[VTF Inject] Running inject.js with MutationObserver super-hacker mode!');

let __vtfCaptureStream = null;
let __vtfHookedAudio = null;
let observer = null;

function tryHookAudioElement(audio) {
    if (!audio || typeof audio !== "object") return;

    if (audio.id && audio.id.startsWith('msRemAudio')) {
        if (audio.srcObject && audio.srcObject !== __vtfCaptureStream) {
            if (__vtfCaptureStream) {
                console.log('[VTF Inject] Unhooked previous stream');
            }
            __vtfCaptureStream = audio.srcObject;
            __vtfHookedAudio = audio;
            window.__vtfCaptureStream = __vtfCaptureStream; // For debug/test
            console.log(`[VTF Inject] ✅ Hooked msRemAudio srcObject stream!`);

            // Inform content.js (won't try to clone the stream—just send a notification)
            window.postMessage({ type: 'VTF_STREAM_HOOKED' }, '*');
        }
    }
}

// Initial scan (in case audio already exists)
function scanAndHook() {
    document.querySelectorAll('audio').forEach(audio => tryHookAudioElement(audio));
}

// Setup observer when DOM is ready
function setupObserver() {
    if (observer) return; // Already setup
    
    // Observe for new audio elements (MutationObserver)
    observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.tagName === 'AUDIO') {
                    console.log('[VTF Inject] Found new audio:', node);
                    tryHookAudioElement(node);
                } else if (node.querySelectorAll) {
                    node.querySelectorAll('audio').forEach(audio => {
                        console.log('[VTF Inject] Found nested audio:', audio);
                        tryHookAudioElement(audio);
                    });
                }
            });
        });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[VTF Inject] MutationObserver started');
}

// Wait for DOM to be ready
function init() {
    if (document.body) {
        setupObserver();
        scanAndHook();
    } else {
        // If body doesn't exist yet, wait a bit
        setTimeout(init, 10);
    }
}

// Also try to hook on audio tag changes
document.addEventListener('play', e => {
    if (e.target.tagName === 'AUDIO') tryHookAudioElement(e.target);
}, true);

// Listen for test events (optionally)
window.addEventListener('VTF_FORCE_REHOOK', () => scanAndHook());

// Expose (for test/debug)
window.__vtfScanAndHook = scanAndHook;
window.__vtfObserver = observer;

// Start initialization
init();