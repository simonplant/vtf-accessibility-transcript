// This runs in the VTF page context, not extension context
(function() {
  console.log('[VTF Audio Hook] Initializing in page context');
  // Set up communication channel
  const sendToExtension = (type, data) => {
    window.postMessage({
      source: 'vtf-audio-hook',
      type: type,
      data: data
    }, '*');
  };
  // Hook into audio element creation
  const originalPlay = HTMLAudioElement.prototype.play;
  HTMLAudioElement.prototype.play = function() {
    if (this.id && this.id.startsWith('msRemAudio-')) {
      console.log('[VTF Audio Hook] Audio element playing:', this.id);
      // Capture directly in page context
      if (this.srcObject && !this._vtfCaptured) {
        this._vtfCaptured = true;
        captureAudioElement(this);
      }
    }
    return originalPlay.apply(this, arguments);
  };
  function captureAudioElement(element) {
    const userId = element.id.replace('msRemAudio-', '');
    const stream = element.srcObject;
    if (!stream) return;
    // Create audio context in page context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000
    });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      // Check for silence
      const maxSample = Math.max(...Array.from(inputData).map(Math.abs));
      if (maxSample < 0.001) return;
      // Convert to Int16 for efficient transfer
      const int16Data = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      // Send to extension
      sendToExtension('audioData', {
        userId: userId,
        samples: Array.from(int16Data),
        timestamp: Date.now()
      });
    };
    source.connect(processor);
    processor.connect(audioContext.destination);
    // Store for cleanup
    element._vtfProcessor = { source, processor, audioContext };
    sendToExtension('captureStarted', { userId });
  }
  // Listen for commands from extension
  window.addEventListener('message', (event) => {
    if (event.data.source !== 'vtf-extension') return;
    switch (event.data.type) {
      case 'stopCapture':
        // Clean up all captures
        document.querySelectorAll('audio[id^="msRemAudio-"]').forEach(el => {
          if (el._vtfProcessor) {
            el._vtfProcessor.source.disconnect();
            el._vtfProcessor.processor.disconnect();
            el._vtfProcessor.audioContext.close();
            delete el._vtfProcessor;
            delete el._vtfCaptured;
          }
        });
        break;
    }
  });
  sendToExtension('hookReady', {});
})(); 