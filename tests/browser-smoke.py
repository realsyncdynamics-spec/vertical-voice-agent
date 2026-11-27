"""Local browser smoke tests. No external requests or provider credentials."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
import functools
import json
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parent.parent
server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(SimpleHTTPRequestHandler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
origin = f"http://127.0.0.1:{server.server_port}"
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width, height in [(1440, 900), (390, 844)]:
            context = browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce")
            context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(origin + "/") else route.abort())
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(origin + "/index.html")
            expect(page.locator("#voice-title")).to_be_visible()
            page.locator("#website-reference").fill("javascript:alert(1)")
            page.locator("#website-entry button").click()
            expect(page.locator("#website-entry-error")).to_be_visible()
            page.locator("#website-reference").fill("www.example.de")
            page.locator("#website-entry button").click()
            expect(page.locator("#ob-website")).to_have_value("https://www.example.de")
            expect(page.locator("#ob-name")).to_have_value("")
            expect(page.locator("#ob-handoff")).to_have_value("")
            expect(page.locator("#chk-telephony")).not_to_be_checked()
            expect(page.locator("#chk-disclosure")).not_to_be_checked()
            expect(page.locator("#website-profile-review")).to_be_hidden()
            page.locator("#ob-name").fill("Testbetrieb")
            page.locator("#ob-handoff").fill("Testkontakt")
            page.locator("#btn-law_office").click()
            expect(page.locator("#ob-name")).to_have_value("Testbetrieb")
            expect(page.locator("#ob-handoff")).to_have_value("Testkontakt")
            expect(page.locator("#chk-privacy")).not_to_be_checked()
            expect(page.locator("#chk-telephony")).not_to_be_checked()
            record = json.loads(page.locator("#json-preview").inner_text())
            assert record["effective_status"] == "paused"
            assert record["enabled_tools"] == []
            page.goto(origin + "/index.html")
            page.get_by_role("link", name="Ohne Website starten", exact=True).click()
            expect(page.locator("#ob-website")).to_have_value("")
            assert not errors, errors
            print(f"PASS customer journey {width}x{height}", flush=True)
            context.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
