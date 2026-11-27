"""Real local HTTP API and browser; deterministic HTML fixture instead of external DNS/network."""
import sys
import json
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scanner"))
from preview_server import build_server
from website_scanner import scan_website
from test_website_scanner import HTML, resolver, requester

TOKEN = "test-only-" + "a" * 40
server = build_server(0, TOKEN, lambda origin: scan_website(origin, resolver, requester))
Thread(target=server.serve_forever, daemon=True).start()
origin = f"http://127.0.0.1:{server.server_port}"
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width, height in [(1440, 900), (390, 844)]:
            context = browser.new_context(viewport={"width": width, "height": height})
            context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(origin + "/") else route.abort())
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(origin + "/index.html")
            page.locator("#website-reference").fill("example.de")
            page.locator("#website-entry button").click()
            expect(page.locator("#website-scan-card")).to_be_visible()
            page.locator("#website-scan-token").fill("wrong")
            page.locator("#website-scan-start").click()
            expect(page.locator("#website-scan-status")).to_have_text("Zugangscode ungültig.")
            page.locator("#website-scan-token").fill(TOKEN)
            page.locator("#website-scan-start").click()
            expect(page.locator("#website-profile-review")).to_be_visible()
            expect(page.locator("#ob-name")).to_have_value("")
            def draft():
                return json.loads(page.locator("#json-preview").inner_text())
            assert "website_profile" not in draft()
            candidate = page.locator(".profile-candidate").filter(has=page.get_by_role("heading",name="Unternehmensname",exact=True))
            expect(candidate).to_contain_text("Testbetrieb")
            expect(candidate).to_contain_text("https://example.de/")
            accept = candidate.get_by_role("button", name="Bestätigte Angabe übernehmen")
            expect(accept).to_be_disabled()
            candidate.get_by_role("checkbox").check()
            accept.click()
            expect(page.locator("#ob-name")).to_have_value("Testbetrieb")
            record = draft()
            assert record["website_profile"]["candidates"][0]["value"] == "Testbetrieb"
            assert record["effective_status"] == "paused" and record["enabled_tools"] == []
            expect(page.locator("#ob-handoff")).to_have_value("")
            expect(page.locator("#chk-telephony")).not_to_be_checked()
            candidate.get_by_role("button",name="Übernahme widerrufen").click()
            expect(page.locator("#ob-name")).to_have_value("")
            assert "website_profile" not in draft()
            candidate.get_by_role("checkbox").check()
            accept.click()
            page.locator("#ob-website").fill("other.de")
            expect(page.locator("#website-profile-review")).to_be_hidden()
            expect(page.locator("#ob-name")).to_have_value("")
            assert "website_profile" not in draft()
            assert not errors, errors
            print(f"PASS authenticated scanner journey {width}x{height}",flush=True)
            context.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
