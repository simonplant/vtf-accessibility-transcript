// audio-processor.js
class PCMWorkletProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    if (inputs[0] && inputs[0][0]) {
      this.port.postMessage(inputs[0][0]);
    }
    return true;
  }
}
registerProcessor('pcm-worklet-processor', PCMWorkletProcessor);