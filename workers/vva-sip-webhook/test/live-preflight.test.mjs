import assert from "node:assert/strict";
import { validateLiveSmokeHealth } from "./live-preflight.mjs";

const safe = {
  environment: "test",
  telephony_enabled: false,
  d1_bound: true,
  secrets_configured: true,
};

assert.equal(validateLiveSmokeHealth(safe), safe);

for (const [name, unsafe] of [
  ["Umgebung", { ...safe, environment: "production" }],
  ["Telefonie", { ...safe, telephony_enabled: true }],
  ["D1", { ...safe, d1_bound: false }],
  ["Secrets", { ...safe, secrets_configured: false }],
  ["fehlende Daten", undefined],
]) {
  assert.throws(
    () => validateLiveSmokeHealth(unsafe),
    /Live-Smoke: Sicherheitsabbruch/,
    name,
  );
}

console.log("5/5 Sicherheitspruefungen bestanden");
