import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { decodePcm, encodePcm, startAudioBridge } from "../../../public/p2-voice/audio-client.mjs";

class Socket {
  readyState = 1;
  listeners = new Map();
  sent = [];
  addEventListener(type, cb) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(cb);
  }
  removeEventListener(type, cb) { this.listeners.get(type)?.delete(cb); }
  emit(type, value) { for (const cb of this.listeners.get(type) || []) cb(value); }
  message(value) { this.emit("message", { data: JSON.stringify(value) }); }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = 3; }
}
class Node {
  connect() {}
  disconnect() {}
}
function fixture() {
  const socket = new Socket(), ends = [], played = [];
  let capture, context, stopped = 0, grant;
  const media = new Promise((resolve) => { grant = resolve; });
  const platform = {
    navigator: { mediaDevices: { getUserMedia: () => media } },
    AudioContext: class {
      constructor() {
        context = this;
        this.sampleRate = 24000;
        this.state = "running";
        this.currentTime = 0;
        this.destination = {};
        this.audioWorklet = { addModule: async () => {} };
      }
      createMediaStreamSource() { return new Node(); }
      createGain() { return Object.assign(new Node(), { gain: { value: 1 } }); }
      createBuffer(_channels, length, rate) {
        return { duration: length / rate, copyToChannel: (samples) => played.push([...samples]) };
      }
      createBufferSource() { return Object.assign(new Node(), { start() {}, stop() {} }); }
      async close() {}
    },
    AudioWorkletNode: class extends Node { constructor() { super(); capture = this; this.port = {}; } },
  };
  return {
    socket, platform, ends, played, capture: () => capture, context: () => context,
    grant: () => grant({ getTracks: () => [{ stop: () => { stopped++; } }] }),
    stopped: () => stopped,
  };
}

test("PCM16 encoding clamps samples and decoding rejects malformed frames", () => {
  const pcm = encodePcm(new Float32Array([-2, -0.5, 0, 0.5, 2]));
  const decoded = [...decodePcm(pcm)];
  assert.deepEqual(decoded, [-1, -0.5, 0, 0.5, 32767 / 32768]);
  assert.throws(() => decodePcm("AA=="), TypeError);
  assert.throws(() => decodePcm("!!!!"), TypeError);
  assert.throws(() => decodePcm("A".repeat(70004)), TypeError);
});

test("worklet groups simulated microphone PCM into 100 ms frames", async () => {
  const script = await readFile(new URL("../../../public/p2-voice/pcm-capture.js", import.meta.url), "utf8");
  let Processor;
  const output = [];
  class Base { constructor() { this.port = { postMessage: (value) => output.push(value) }; } }
  vm.runInNewContext(script, {
    AudioWorkletProcessor: Base, Float32Array,
    registerProcessor: (name, implementation) => { assert.equal(name, "p2-pcm-capture"); Processor = implementation; },
  });
  const processor = new Processor();
  for (let i = 0; i < 20; i++) processor.process([[new Float32Array(128).fill(0.25)]]);
  assert.equal(output.length, 1);
  assert.equal(output[0].length, 2400);
  assert.equal(output[0][2399], 0.25);
});

test("authorized socket buffers greeting, streams microphone and plays PCM", async () => {
  const f = fixture();
  const starting = startAudioBridge({ socket: f.socket, platform: f.platform, onEnd: (reason) => f.ends.push(reason) });
  f.socket.message({ type: "ready", sampleRate: 24000 });
  f.socket.message({ type: "audio", audio: encodePcm(new Float32Array([0.5, -0.5])) });
  f.grant();
  const session = await starting;
  assert.deepEqual(f.played[0], [0.5, -0.5]);
  f.capture().port.onmessage({ data: new Float32Array(2400).fill(0.25) });
  assert.equal(f.socket.sent[0].type, "audio");
  assert.equal(decodePcm(f.socket.sent[0].audio).length, 2400);
  f.socket.message({ type: "speech_started" });
  session.stop();
  assert.equal(f.socket.sent.at(-1).type, "stop");
  assert.deepEqual(f.ends, ["stopped"]);
  assert.equal(f.stopped(), 1);
  assert.equal(f.socket.readyState, 3);
});

test("disconnect before microphone permission stops the later stream", async () => {
  const f = fixture();
  const starting = startAudioBridge({ socket: f.socket, platform: f.platform, onEnd: (reason) => f.ends.push(reason) });
  f.socket.emit("close", {});
  f.grant();
  await starting;
  assert.equal(f.stopped(), 1);
  assert.deepEqual(f.ends, ["ended"]);
});

test("wrong negotiated rate fails closed and releases the microphone", async () => {
  const f = fixture();
  const starting = startAudioBridge({ socket: f.socket, platform: f.platform, onEnd: (reason) => f.ends.push(reason) });
  f.socket.message({ type: "ready", sampleRate: 48000 });
  f.grant();
  await starting;
  assert.deepEqual(f.ends, ["protocol"]);
  assert.equal(f.stopped(), 1);
});
