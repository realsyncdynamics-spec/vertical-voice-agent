const RATE = 24_000;
const MAX_AUDIO = 70_000;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function encodePcm(samples) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, Math.round(sample < 0 ? sample * 32768 : sample * 32767), true);
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function decodePcm(audio) {
  if (typeof audio !== "string" || !audio || audio.length > MAX_AUDIO || !BASE64.test(audio)) {
    throw new TypeError("Invalid PCM audio");
  }
  const binary = atob(audio);
  if (binary.length % 2) throw new TypeError("Invalid PCM audio");
  const samples = new Float32Array(binary.length / 2);
  for (let i = 0; i < samples.length; i++) {
    const value = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
    samples[i] = (value >= 32768 ? value - 65536 : value) / 32768;
  }
  return samples;
}

/**
 * Takes an already authorized socket. This module does not open a gateway or
 * select a tenant. Call only in response to a user gesture and privacy notice.
 */
export async function startAudioBridge({ socket, onEnd, platform = globalThis }) {
  if (!socket || socket.readyState !== 1 || typeof onEnd !== "function" ||
      typeof platform.navigator?.mediaDevices?.getUserMedia !== "function" ||
      typeof platform.AudioContext !== "function" || typeof platform.AudioWorkletNode !== "function") {
    throw new Error("Audio bridge unavailable");
  }
  let stopped = false, ready = false, stream, context, capture, source, muted, playhead = 0;
  let pendingBytes = 0;
  const pending = [];
  const playing = new Set();
  const flush = () => {
    for (const node of playing) {
      try { node.stop(); } catch { /* Playback already ended. */ }
    }
    playing.clear();
    playhead = 0;
    pending.length = 0;
    pendingBytes = 0;
  };
  const end = (reason) => {
    if (stopped) return;
    stopped = true;
    flush();
    if (capture) capture.port.onmessage = null;
    source?.disconnect();
    capture?.disconnect();
    muted?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    socket.removeEventListener("message", message);
    socket.removeEventListener("close", closed);
    socket.removeEventListener("error", failed);
    if (socket.readyState === 1) socket.close();
    if (context) void context.close().catch((error) => console.error("Audio context close failed", error));
    onEnd(reason);
  };
  const play = (samples) => {
    if (Math.max(playhead - context.currentTime, 0) + samples.length / RATE > 3) return end("audio_overflow");
    const buffer = context.createBuffer(1, samples.length, RATE);
    buffer.copyToChannel(samples, 0);
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    const at = Math.max(context.currentTime + 0.02, playhead);
    playhead = at + buffer.duration;
    playing.add(node);
    node.onended = () => playing.delete(node);
    node.start(at);
  };
  const message = (event) => {
    if (stopped || typeof event.data !== "string") return;
    if (event.data.length > MAX_AUDIO + 1024) return end("protocol");
    let data;
    try { data = JSON.parse(event.data); } catch { return end("protocol"); }
    if (data?.type === "ready") {
      if (data.sampleRate !== RATE) return end("protocol");
      ready = true;
    } else if (data?.type === "audio" && ready) {
      let samples;
      try { samples = decodePcm(data.audio); } catch { return end("protocol"); }
      if (!context) {
        pendingBytes += samples.length;
        if (pendingBytes > RATE * 3) return end("audio_overflow");
        pending.push(samples);
      } else {
        play(samples);
      }
    } else if (data?.type === "speech_started") {
      flush();
    } else if (data?.type === "closed") {
      end(data.reason === "time_limit" ? "time_limit" : "ended");
    }
  };
  const closed = () => end("ended");
  const failed = () => end("connection_error");
  socket.addEventListener("message", message);
  socket.addEventListener("close", closed);
  socket.addEventListener("error", failed);
  try {
    stream = await platform.navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (stopped) {
      stream.getTracks().forEach((track) => track.stop());
      return { stop: () => {} };
    }
    context = new platform.AudioContext({ sampleRate: RATE });
    if (context.sampleRate !== RATE) throw new Error("24 kHz audio unavailable");
    if (context.state === "suspended") await context.resume();
    for (const samples of pending.splice(0)) {
      if (stopped) break;
      play(samples);
    }
    pendingBytes = 0;
    if (stopped) return { stop: () => {} };
    await context.audioWorklet.addModule(new URL("./pcm-capture.js", import.meta.url).href);
    if (stopped) return { stop: () => {} };
    source = context.createMediaStreamSource(stream);
    capture = new platform.AudioWorkletNode(context, "p2-pcm-capture");
    muted = context.createGain();
    muted.gain.value = 0;
    capture.port.onmessage = (event) => {
      if (ready && !stopped && socket.readyState === 1 && event.data instanceof Float32Array && event.data.length === 2400) {
        try { socket.send(JSON.stringify({ type: "audio", audio: encodePcm(event.data) })); }
        catch { end("connection_error"); }
      }
    };
    source.connect(capture);
    capture.connect(muted);
    muted.connect(context.destination);
  } catch (error) {
    end("audio_error");
    throw error;
  }
  return {
    stop() {
      if (!stopped && socket.readyState === 1) {
        try { socket.send(JSON.stringify({ type: "stop" })); } catch { end("connection_error"); return; }
      }
      end("stopped");
    },
  };
}
