const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const landing = read('index.html');
const wizard = read('onboarding.html');
const normalizer = wizard.match(/function normalizeWebsiteReference\(value\) \{[\s\S]*?\n    \}/)[0];
const normalize = vm.runInNewContext(normalizer + '\nnormalizeWebsiteReference', { URL });
const cases = [
  ['www.example.de', 'https://www.example.de'],
  ['https://example.de/path?token=secret#abc', 'https://example.de'],
  ['', ''],
  ['javascript:alert(1)', ''],
  ['https://user:pass@example.de', ''],
  ['127.0.0.1', ''],
  ['example.de:8080', ''],
  ['foo bar.de', ''],
];
for (const [input, expected] of cases) {
  test('normalization: ' + input, () => assert.equal(normalize(input), expected));
  test('landing: ' + input, () => {
    const handlers = {};
    const field = { value: input, setAttribute() {}, removeAttribute() {}, focus() {} };
    const error = { hidden: true };
    const form = { addEventListener(name, fn) { handlers[name] = fn; } };
    field.addEventListener = () => {};
    const elements = { 'website-entry': form, 'website-reference': field, 'website-entry-error': error };
    let destination;
    const script = [...landing.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m => m[1].includes('const form=document.getElementById("website-entry")'))[1];
    vm.runInNewContext(script, { URL, document: { getElementById: id => elements[id] }, location: { assign: value => { destination = value; } } });
    handlers.submit({ preventDefault() {} });
    if (expected) assert.equal(destination, 'onboarding.html#website=' + encodeURIComponent(expected));
    else if (!input) assert.equal(destination, 'onboarding.html');
    else { assert.equal(destination, undefined); assert.equal(error.hidden, false); }
  });
}
test('export remains paused and without enabled tools', () => {
  assert.match(wizard, /const effectiveStatus = "paused"/);
  assert.match(wizard, /enabled_tools: \[\],/);
  assert.doesNotMatch(wizard, /id="chk-(?:disclosure|telephony|privacy|recording|rec-approved)" checked/);
});
