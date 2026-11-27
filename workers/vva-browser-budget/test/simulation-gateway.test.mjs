import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { Miniflare } from "miniflare";
import WebSocket, { WebSocketServer } from "ws";
import { openSimulatedSession } from "../src/simulation-gateway.js";
import { startAudioBridge, decodePcm, encodePcm } from "../../../public/p2-voice/audio-client.mjs";

const tenantId = "22222222-2222-4222-8222-222222222222";
class Socket {
  listeners = new Map();
  sent = [];
  readyState = 1;
  addEventListener(type, cb) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(cb);
  }
  removeEventListener(type, cb) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== cb));
  }
  send(raw) {
    this.sent.push(JSON.parse(raw));
    if (this.peer) for (const cb of this.peer.listeners.get("message") || []) cb({ data: raw });
  }
  close() { this.readyState = 3; }
  message(data) { for (const cb of this.listeners.get("message") || []) cb({ data: JSON.stringify(data) }); }
}
async function setup(t) {
  const mf = new Miniflare({
    modules: true, script: "export default { fetch() { return new Response('test'); } }",
    compatibilityDate: "2026-08-01", d1Databases: ["BROWSER_DB"],
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("BROWSER_DB");
  const sql = await readFile(new URL("../migrations/0001_browser_budget.sql", import.meta.url), "utf8");
  for (const statement of sql.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  await db.prepare("INSERT INTO browser_budget_global VALUES (1, 'EUR', 100, 100, 100)").run();
  await db.prepare("INSERT INTO browser_budget_tenants VALUES (?, 100, 100)").bind(tenantId).run();
  const upstream = new Socket(), client = new Socket();
  const profile = { confirmed: true, name: "Testbetrieb", facts: ["Montags geöffnet."], voice: "castor", maxCostMicros: 60, maxSessionMs: 2000 };
  let connections = 0;
  const deps = {
    db,
    auth: { authenticate: async ({ token, requestedTenantId }) => token === "test-token"
      ? { userId: "local-user", tenantId: requestedTenantId } : null },
    profiles: { load: async () => profile },
    simulator: { mode: "simulation", connect: async () => { connections++; return upstream; } },
    sessionId: () => "session-one",
  };
  return { db, deps, client, upstream, profile, connections: () => connections };
}
const request = (client, token = "test-token") => ({ client, token, requestedTenantId: tenantId });

test("only authenticated, confirmed, budgeted simulation can connect", async (t) => {
  const x = await setup(t);
  assert.equal((await openSimulatedSession(request(x.client, "wrong"), x.deps)).reason, "UNAUTHORIZED");
  assert.equal(x.connections(), 0);
  x.profile.confirmed = false;
  assert.equal((await openSimulatedSession(request(x.client), x.deps)).reason, "PROFILE_UNAVAILABLE");
  assert.equal(x.connections(), 0);
  x.profile.confirmed = true;
  const result = await openSimulatedSession(request(x.client), x.deps);
  assert.equal(result.opened, true);
  assert.equal(x.connections(), 1);
  assert.equal((await x.db.prepare("SELECT reserved_micros FROM browser_budget_sessions").first()).reserved_micros, 60);
  assert.equal(x.upstream.sent[0].session.voice, "castor");
  assert.match(x.upstream.sent[0].session.instructions, /Montags geöffnet/);
  x.upstream.message({ type: "session.updated" });
  x.client.message({ type: "audio", audio: "AAA=" });
  assert.equal(x.upstream.sent.at(-1).type, "input_audio_buffer.append");
  x.upstream.message({ type: "response.audio.delta", delta: "AAA=" });
  assert.equal(x.client.sent.at(-1).type, "audio");
  result.relay.close("client_closed");
  assert.equal((await openSimulatedSession(request(x.client), x.deps)).reason, "ALREADY_RESERVED");
  assert.equal(x.connections(), 1);
});

test("foreign identity, missing budget and non-simulation providers never connect", async (t) => {
  const x = await setup(t);
  x.deps.auth.authenticate = async () => ({ userId: "user", tenantId: "foreign" });
  assert.equal((await openSimulatedSession(request(x.client), x.deps)).reason, "UNAUTHORIZED");
  x.deps.auth.authenticate = async () => ({ userId: "user", tenantId });
  await x.db.prepare("DELETE FROM browser_budget_global").run();
  assert.equal((await openSimulatedSession(request(x.client), x.deps)).reason, "BUDGET_UNAVAILABLE_OR_LIMIT_REACHED");
  x.deps.simulator.mode = "live";
  await assert.rejects(() => openSimulatedSession(request(x.client), x.deps), /dependencies unavailable/);
  assert.equal(x.connections(), 0);
});

test("ambiguous simulator failure retains the budget reservation", async (t) => {
  const x = await setup(t);
  x.deps.simulator.connect = async () => { throw new Error("simulated disconnect"); };
  await assert.rejects(() => openSimulatedSession(request(x.client), x.deps), /simulated disconnect/);
  const row = await x.db.prepare("SELECT reserved_micros, actual_micros FROM browser_budget_sessions").first();
  assert.equal(row.reserved_micros, 60);
  assert.equal(row.actual_micros, null);
});

test("parallel authenticated sessions cannot connect twice at the budget boundary", async (t) => {
  const x = await setup(t);
  let next = 0;
  x.deps.sessionId = () => `parallel-${++next}`;
  const results = await Promise.all([
    openSimulatedSession(request(new Socket()), x.deps),
    openSimulatedSession(request(new Socket()), x.deps),
  ]);
  assert.equal(results.filter((result) => result.opened).length, 1);
  assert.equal(x.connections(), 1);
  results.find((result) => result.opened).relay.close("client_closed");
});

test("local simulated session carries microphone PCM through the budgeted relay to playback", async (t) => {
  const x = await setup(t);
  const browser = new Socket(), server = new Socket();
  browser.peer = server;
  server.peer = browser;
  let capture, stopped = false;
  const playback = [];
  class Node {
    connect() {}
    disconnect() {}
  }
  const platform = {
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped = true; } }] }) } },
    AudioContext: class {
      sampleRate = 24000;
      state = "running";
      currentTime = 0;
      destination = {};
      audioWorklet = { addModule: async () => {} };
      createMediaStreamSource() { return new Node(); }
      createGain() { return Object.assign(new Node(), { gain: { value: 1 } }); }
      createBuffer(_channels, length, rate) {
        return { duration: length / rate, copyToChannel: (samples) => playback.push([...samples]) };
      }
      createBufferSource() { return Object.assign(new Node(), { start() {}, stop() {} }); }
      async close() {}
    },
    AudioWorkletNode: class extends Node { constructor() { super(); capture = this; this.port = {}; } },
  };
  const result = await openSimulatedSession(request(server), x.deps);
  assert.equal(result.opened, true);
  const bridge = await startAudioBridge({ socket: browser, platform, onEnd: () => {} });
  x.upstream.message({ type: "session.updated" });
  capture.port.onmessage({ data: new Float32Array(2400).fill(0.25) });
  const audio = x.upstream.sent.find((item) => item.type === "input_audio_buffer.append");
  assert.equal(decodePcm(audio.audio).length, 2400);
  x.upstream.message({ type: "response.audio.delta", delta: encodePcm(new Float32Array([0.5, -0.5])) });
  assert.deepEqual(playback, [[0.5, -0.5]]);
  bridge.stop();
  assert.equal(stopped, true);
  assert.equal((await x.db.prepare("SELECT COUNT(*) AS n FROM browser_budget_sessions").first()).n, 1);
});

test("local WebSocket server carries simulated audio through the reserved gateway", async (t) => {
  const x = await setup(t);
  const http = createServer();
  const wss = new WebSocketServer({ server: http });
  let gateway, gatewayError;
  t.after(async () => {
    gateway?.relay.close("client_closed");
    for (const socket of wss.clients) socket.terminate();
    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve) => http.close(resolve));
  });
  wss.on("connection", (socket) => {
    void openSimulatedSession(request(socket), x.deps)
      .then((result) => { gateway = result; })
      .catch((error) => { gatewayError = error; socket.close(); });
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const browser = new WebSocket(`ws://127.0.0.1:${http.address().port}/`);
  await once(browser, "open");
  let capture;
  const playback = [];
  class Node { connect() {} disconnect() {} }
  const platform = {
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } },
    AudioContext: class {
      sampleRate = 24000; state = "running"; currentTime = 0; destination = {};
      audioWorklet = { addModule: async () => {} };
      createMediaStreamSource() { return new Node(); }
      createGain() { return Object.assign(new Node(), { gain: { value: 1 } }); }
      createBuffer(_channels, length, rate) {
        return { duration: length / rate, copyToChannel: (samples) => playback.push([...samples]) };
      }
      createBufferSource() { return Object.assign(new Node(), { start() {}, stop() {} }); }
      async close() {}
    },
    AudioWorkletNode: class extends Node { constructor() { super(); capture = this; this.port = {}; } },
  };
  const bridge = await startAudioBridge({ socket: browser, platform, onEnd: () => {} });
  async function waitFor(predicate) {
    const deadline = Date.now() + 2000;
    while (!predicate()) {
      if (gatewayError) throw gatewayError;
      if (Date.now() >= deadline) throw new Error("local WebSocket test timed out");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  await waitFor(() => gateway);
  assert.equal(gateway.opened, true);
  const ready = once(browser, "message");
  x.upstream.message({ type: "session.updated" });
  await ready;
  capture.port.onmessage({ data: new Float32Array(2400).fill(0.25) });
  await waitFor(() => x.upstream.sent.some((item) => item.type === "input_audio_buffer.append"));
  x.upstream.message({ type: "response.audio.delta", delta: encodePcm(new Float32Array([0.5, -0.5])) });
  await waitFor(() => playback.length > 0);
  assert.deepEqual(playback, [[0.5, -0.5]]);
  assert.equal((await x.db.prepare("SELECT reserved_micros FROM browser_budget_sessions").first()).reserved_micros, 60);
  bridge.stop();
});
