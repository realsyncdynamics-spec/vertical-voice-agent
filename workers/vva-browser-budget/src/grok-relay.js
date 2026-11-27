// Protocol adapted from RealSyncDynamics.AI src/lib/company-voice/grok-relay.ts
// at a53dce7c4dd166d29c66a3e2fe21a95a71564774. No provider connection is opened here.
const SAMPLE_RATE = 24_000;
const MAX_SESSION_MS = 180_000;
const MAX_FRAME = 70_000;
const MAX_AUDIO_CHARS = Math.ceil(180 * SAMPLE_RATE * 2 * 4 / 3 * 1.25);
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function frame(data, limit) {
  if (typeof data !== "string" || data.length > limit) return null;
  try {
    const value = JSON.parse(data);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function validPcm(audio) {
  if (typeof audio !== "string" || !audio || audio.length % 4 || !BASE64.test(audio)) return false;
  const padding = audio.endsWith("==") ? 2 : audio.endsWith("=") ? 1 : 0;
  return ((audio.length / 4 * 3 - padding) % 2) === 0;
}

/**
 * Both sockets must already be accepted. The caller must authenticate,
 * reserve budget and enforce the provider's cost bound before invoking this.
 */
export function startGrokRelay({ client, upstream, voice, instructions, greeting, onClose,
  maxSessionMs = MAX_SESSION_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  if (typeof voice !== "string" || !/^[a-z]{1,32}$/.test(voice) ||
      typeof instructions !== "string" || !instructions || instructions.length > 20_000 ||
      typeof greeting !== "string" || !greeting || greeting.length > 1000 ||
      !Number.isInteger(maxSessionMs) || maxSessionMs < 1 || maxSessionMs > MAX_SESSION_MS) {
    throw new TypeError("Invalid relay configuration");
  }
  let closed = false;
  let ready = false;
  let badFrames = 0;
  let audioChars = 0;
  let timer;
  const send = (socket, message) => {
    try { socket.send(JSON.stringify(message)); return true; } catch { return false; }
  };
  const close = (reason) => {
    if (closed) return;
    closed = true;
    clearTimer(timer);
    if (reason !== "client_closed") send(client, { type: "closed", reason });
    for (const socket of [client, upstream]) {
      try { socket.close(1000, reason); } catch { /* Already closed. */ }
    }
    onClose?.(reason);
  };
  timer = setTimer(() => close("time_limit"), maxSessionMs);
  upstream.addEventListener("message", (event) => {
    if (closed) return;
    const message = frame(event.data, 4_000_000);
    if (!message) return;
    if (message.type === "session.updated" && !ready) {
      ready = true;
      if (!send(upstream, {
        type: "conversation.item.create",
        item: { type: "force_message", role: "assistant", interruptible: true,
          content: [{ type: "output_text", text: greeting }] },
      })) return close("provider_closed");
      if (!send(client, { type: "ready", sampleRate: SAMPLE_RATE, maxSeconds: Math.floor(maxSessionMs / 1000), greeting })) close("client_closed");
    } else if (ready && ["response.output_audio.delta", "response.audio.delta"].includes(message.type) && validPcm(message.delta)) {
      if (!send(client, { type: "audio", audio: message.delta })) close("client_closed");
    } else if (ready && message.type === "input_audio_buffer.speech_started") {
      if (!send(client, { type: "speech_started" })) close("client_closed");
    } else if (message.type === "error") {
      close(ready ? "provider_closed" : "setup_failed");
    }
  });
  upstream.addEventListener("close", () => close(ready ? "provider_closed" : "setup_failed"));
  upstream.addEventListener("error", () => close(ready ? "provider_closed" : "setup_failed"));
  client.addEventListener("message", (event) => {
    if (closed) return;
    const message = frame(event.data, MAX_FRAME);
    if (!message || (message.type !== "stop" && (message.type !== "audio" || !validPcm(message.audio)))) {
      if (++badFrames >= 5) close("protocol");
      return;
    }
    if (message.type === "stop") return close("client_closed");
    if (!ready) return;
    audioChars += message.audio.length;
    if (audioChars > MAX_AUDIO_CHARS) return close("audio_limit");
    if (!send(upstream, { type: "input_audio_buffer.append", audio: message.audio })) close("provider_closed");
  });
  client.addEventListener("close", () => close("client_closed"));
  client.addEventListener("error", () => close("client_closed"));
  if (!send(upstream, {
    type: "session.update",
    session: {
      instructions, voice, turn_detection: { type: "server_vad" },
      audio: {
        input: { format: { type: "audio/pcm", rate: SAMPLE_RATE }, transcription: { language_hint: "de" } },
        output: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
      },
      tools: [],
    },
  })) close("setup_failed");
  return { close };
}
