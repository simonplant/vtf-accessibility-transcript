// test-audio.js - Test audio generation for VTF transcription through Howler
console.log('[Test Audio] Loading...');

// Function to create and play test speech through Howler
function playTestSpeech(text = "Testing VTF transcription. One, two, three, four, five.") {
    // First, convert text to speech and capture as audio
    return new Promise((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        
        // Create a recording context
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const dest = audioContext.createMediaStreamDestination();
        
        // Use MediaRecorder to capture the speech
        const mediaRecorder = new MediaRecorder(dest.stream);
        const chunks = [];
        
        mediaRecorder.ondataavailable = e => chunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            
            // Now play through Howler (like VTF does)
            const howl = new Howl({
                src: [url],
                format: ['webm'],
                volume: 1.0,
                onload: function() {
                    console.log('[Test Audio] Speech loaded into Howler, playing...');
                    this.play();
                },
                onplay: function() {
                    console.log('[Test Audio] Playing:', text);
                    resolve(this);
                },
                onend: function() {
                    console.log('[Test Audio] Finished');
                    URL.revokeObjectURL(url);
                },
                onerror: function(id, err) {
                    console.error('[Test Audio] Howler error:', err);
                    reject(err);
                }
            });
        };
        
        // Start recording before speaking
        mediaRecorder.start();
        
        utterance.onend = () => {
            setTimeout(() => {
                mediaRecorder.stop();
            }, 100);
        };
        
        utterance.onerror = (err) => {
            mediaRecorder.stop();
            reject(err);
        };
        
        speechSynthesis.speak(utterance);
    });
}

// Simpler approach - create beeps/tones through Howler
function playTestTone(frequency = 440, duration = 2000) {
    console.log('[Test Audio] Generating test tone...');
    
    // Generate a data URI with a sine wave
    const sampleRate = 22050;
    const numSamples = (sampleRate * duration) / 1000;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, numSamples * 2, true);
    
    // Generate sine wave
    for (let i = 0; i < numSamples; i++) {
        const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0x7FFF;
        view.setInt16(44 + i * 2, sample, true);
    }
    
    const blob = new Blob([buffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    
    // Play through Howler
    const howl = new Howl({
        src: [url],
        format: ['wav'],
        volume: 0.5,
        onload: function() {
            console.log('[Test Audio] Tone loaded, playing...');
            this.play();
        },
        onend: function() {
            URL.revokeObjectURL(url);
        }
    });
    
    return howl;
}

// Use VTF's existing sounds
function playVTFSound(index = 7) {
    if (window.Howler && window.Howler._howls[index]) {
        console.log('[Test Audio] Playing VTF sound', index);
        window.Howler._howls[index].play();
        return window.Howler._howls[index];
    } else {
        console.error('[Test Audio] VTF sound not found at index', index);
        return null;
    }
}

// Test with speech synthesis through data URI
function testSpeechThroughHowler(text = "Testing VTF transcription system. Can you hear me clearly?") {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    
    // Use Google's TTS as a test
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`;
    
    // Create Howler sound from URL
    const howl = new Howl({
        src: [url],
        html5: true, // Required for cross-origin
        format: ['mp3'],
        volume: 1.0,
        onload: function() {
            console.log('[Test Audio] TTS loaded, playing...');
            this.play();
        },
        onplay: function() {
            console.log('[Test Audio] Speaking:', text);
        },
        onerror: function(id, err) {
            console.error('[Test Audio] Error:', err);
            console.log('[Test Audio] Try using playTestTone() instead');
        }
    });
    
    return howl;
}

// Test functions to call from console
window.vtfTest = {
    // Play a test tone
    tone: (freq, duration) => playTestTone(freq, duration),
    
    // Play VTF's own sounds
    vtfSound: (index) => playVTFSound(index),
    
    // Play all VTF sounds
    allVTFSounds: () => {
        for (let i = 0; i < 10; i++) {
            setTimeout(() => playVTFSound(i), i * 1000);
        }
    },
    
    // Try TTS through Howler
    speak: (text) => testSpeechThroughHowler(text),
    
    // Simple beep pattern
    beeps: () => {
        playTestTone(440, 200);
        setTimeout(() => playTestTone(880, 200), 300);
        setTimeout(() => playTestTone(440, 200), 600);
    }
};

console.log('[Test Audio] Ready! Use window.vtfTest functions:');
console.log('- vtfTest.tone(440, 1000) - Play a test tone');
console.log('- vtfTest.vtfSound(7) - Play VTF sound (0-9)');
console.log('- vtfTest.allVTFSounds() - Play all VTF sounds');
console.log('- vtfTest.beeps() - Play beep pattern');
console.log('- vtfTest.speak("text") - Try TTS through Howler');