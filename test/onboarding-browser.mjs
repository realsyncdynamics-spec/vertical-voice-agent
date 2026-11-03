import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [label, width, height] of [['mobile', 375, 812], ['desktop', 1280, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(pathToFileURL(resolve('onboarding.html')).href, { waitUntil: 'load' });
    await page.waitForSelector('#json-preview');
    const steps = await page.locator('.voice-step-nav a').count();
    assert.equal(steps, 6, 'six navigation steps');
    assert.equal(await page.locator('.voice-step').count(), 6, 'six actual steps');
    const state = JSON.parse(await page.locator('#json-preview').innerText());
    assert.equal(state.requested_status, 'draft');
    assert.equal(state.runtime_status, 'not_deployed');
    assert.deepEqual(state.enabled_tools, []);
    assert.equal(state.validation_only, true);
    assert.equal(state.valid, false, 'not pre-validated with demo details');
    assert.equal(await page.locator('#ob-name').inputValue(), '');
    assert.equal(await page.locator('#ob-handoff').inputValue(), '');
    assert.equal(await page.locator('#chk-telephony').isChecked(), false);
    assert.equal(await page.locator('#chk-privacy').isChecked(), false);
    assert.match(await page.locator('#status-pill').innerText(), /ENTWURF/);
    await page.locator('#ob-name').fill('Testbetrieb QA');
    await page.locator('#ob-handoff').fill('+49 123 456789');
    await page.locator('#chk-telephony').check();
    const complete = JSON.parse(await page.locator('#json-preview').innerText());
    assert.equal(complete.valid, true);
    assert.equal(complete.effective_status, 'draft_validated');
    assert.deepEqual(complete.enabled_tools, []);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 2, label + ' horizontal overflow ' + overflow);
    await page.locator('#chk-disclosure').uncheck();
    assert.match(await page.locator('#status-pill').innerText(), /GESPERRT/);
    const blocked = JSON.parse(await page.locator('#json-preview').innerText());
    assert.equal(blocked.valid, false);
    assert.deepEqual(blocked.enabled_tools, []);
    await page.locator('#chk-disclosure').check();
    await page.screenshot({ path: 'screenshots/voice-onboarding-' + label + '.png', fullPage: true });
    assert.deepEqual(errors, [], label + ' JS errors');
    await page.close();
  }
} finally {
  await browser.close();
}
