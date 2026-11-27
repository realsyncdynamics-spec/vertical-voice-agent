class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2400);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let offset = 0; offset < channel.length;) {
      const count = Math.min(channel.length - offset, this.buffer.length - this.filled);
      this.buffer.set(channel.subarray(offset, offset + count), this.filled);
      this.filled += count;
      offset += count;
      if (this.filled === this.buffer.length) {
        this.port.postMessage(this.buffer.slice());
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("p2-pcm-capture", PcmCapture);
