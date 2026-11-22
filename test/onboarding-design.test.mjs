import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = readFileSync(new URL('../onboarding.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../onboarding-brand.css', import.meta.url), 'utf8');

test('exactly one canonical six-step workflow', () => {
  for (let i = 1; i <= 6; i++) {
    assert.equal((html.match(new RegExp('id="step-' + i + '"', 'g')) ?? []).length, 1);
    assert.match(html, new RegExp('href="#step-' + i + '"'));
  }
  assert.match(html, /class="voice-onboarding"/);
  assert.match(html, /onboarding-brand\.css/);
  assert.match(html, /realsyncdynamicsai\.de\/unternehmen/);
});

test('brand matches landing and mobile layout is present', () => {
  assert.match(css, /#121212/);
  assert.match(css, /#d6ae52/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /focus-visible/);
  assert.doesNotMatch(css, /fonts\.googleapis|@import.*https?:/i);
});

test('the configuration cannot falsely activate live calls or tools', () => {
  assert.match(html, /requested_status: "draft"/);
  assert.match(html, /runtime_status: "not_deployed"/);
  assert.match(html, /validation_only: true/);
  assert.match(html, /const enabledTools = \[\]/);
  assert.match(html, /enabled_tools: enabledTools/);
  assert.match(html, /ENTWURF · GEPRÜFT/);
  assert.match(html, /document\.getElementById\("chk-telephony"\)\.checked = false/);
  assert.match(html, /document\.getElementById\("chk-privacy"\)\.checked = false/);
  assert.match(html, /MISSING_HUMAN_HANDOFF/);
  assert.doesNotMatch(html, /id="ob-name" value="SHK Meisterbetrieb Rennsteig"/);
  assert.doesNotMatch(html, /pill\.textContent = "ACTIVE · VALIDATED"/);
  assert.match(html, /\(SIMULATION\)/);
});

test('all inline JavaScript compiles before deployment', () => {
  const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length >= 2);
  for (const [i, match] of blocks.entries()) assert.doesNotThrow(
    () => new vm.Script(match[1], { filename: 'onboarding-inline-' + i + '.js' }),
  );
});
