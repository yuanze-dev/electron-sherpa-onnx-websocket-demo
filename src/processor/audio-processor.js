class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleRate = 16000;
    this.bufferSize = this.sampleRate / 20; // 0.05 second buffer
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    // Copy input to output for monitoring (optional)
    if (output.length > 0 && input.length > 0) {
      // output[0].set(input[0]);
      // output?.[1].set(input[0]);
    }

    if (input.length > 0) {
      const inputChannel = input[0];

      for (let i = 0; i < inputChannel.length; i++) {
        this.buffer[this.bufferIndex] = inputChannel[i];
        this.bufferIndex++;

        if (this.bufferIndex >= this.bufferSize) {
          // Send the buffer to main thread
          this.port.postMessage({
            type: "audioData",
            data: new Float32Array(this.buffer),
          });

          // Reset buffer
          this.bufferIndex = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor("audio-processor", AudioProcessor);
