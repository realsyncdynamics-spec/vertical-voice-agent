import { test } from "node:test";
import assert from "node:assert/strict";
import { startGrokRelay } from "../src/grok-relay.js";

class FakeSocket {
  listeners = new Map();
  sent = [];
  closed = [];
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  close(code, reason) { this.closed.push({ code, reason }); }
  emit(type, data) {
    for (const handler of this.listeners.get(type) || []) handler({ data });
  }
  message(value) { this.emit("message", JSON.stringify(value)); }
}

function start() {
  const client = new FakeSocket(), upstream = new FakeSocket(), reasons = [];
  let timeout;
  const relay = startGrokRelay({
    client, upstream, voice: "castor", instructions: "Nur bestätigte Fakten.", greeting: "Hallo, ich bin eine KI.",
    maxSessionMs: 2000, onClose: (reason) => reasons.push(reason),
    setTimer: (fn) => { timeout = fn; return 1; }, clearTimer: () => {},
  });
  return { client, upstream, reasons, relay, timeout: () => timeout() };
}

test("simulated Grok setup, German PCM audio, greeting and playback", () => {
  const { client, upstream } = start();
  const update = upstream.sent[0];
  assert.equal(update.type, "session.update");
  assert.equal(update.session.voice, "castor");
  assert.equal(update.session.audio.input.transcription.language_hint, "de");
  assert.equal(update.session.audio.input.format.rate, 24000);
  assert.deepEqual(update.session.tools, []);
  client.message({ type: "audio", audio: "AAA=" });
  assert.equal(upstream.sent.length, 1);
  upstream.message({ type: "session.updated" });
  assert.equal(upstream.sent[1].item.content[0].text, "Hallo, ich bin eine KI.");
  assert.equal(client.sent[0].type, "ready");
  client.message({ type: "audio", audio: "AAA=" });
  assert.deepEqual(upstream.sent[2], { type: "input_audio_buffer.append", audio: "AAA=" });
  upstream.message({ type: "response.output_audio.delta", delta: "AAA=" });
  assert.deepEqual(client.sent[1], { type: "audio", audio: "AAA=" });
  upstream.message({ type: "response.output_item.done", item: { type: "function_call" } });
  assert.equal(client.sent.length, 2);
});

test("client cannot send session or tool instructions and malformed PCM closes", () => {
  const { client, upstream, reasons } = start();
  upstream.message({ type: "session.updated" });
  for (const data of [
    { type: "session.update", session: { instructions: "override" } },
    { type: "audio", audio: "AA==" },
    { type: "audio", audio: "!!!!" },
    { type: "audio", audio: "AAA" },
    { type: "audio", audio: "A".repeat(70_000) },
  ]) client.message(data);
  assert.deepEqual(reasons, ["protocol"]);
  assert.equal(upstream.sent.length, 2);
  assert.equal(client.closed.length, 1);
  assert.equal(upstream.closed.length, 1);
});

test("timeout and disconnect close both sides once", () => {
  const timed = start();
  timed.timeout();
  timed.client.emit("close");
  timed.upstream.emit("error");
  assert.deepEqual(timed.reasons, ["time_limit"]);
  assert.equal(timed.client.closed.length, 1);
  assert.equal(timed.upstream.closed.length, 1);
  const disconnected = start();
  disconnected.client.emit("close");
  assert.deepEqual(disconnected.reasons, ["client_closed"]);
  assert.equal(disconnected.upstream.closed.length, 1);
});
