"""Local authenticated preview only; no production bind or provisioning."""
import argparse
import collections
import hmac
import json
import mimetypes
import os
import secrets
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from website_scanner import scan_website, ScanError, target

ROOT = Path(__file__).resolve().parent.parent
mimetypes.add_type("text/javascript", ".mjs")
PAGES = {"index.html", "onboarding.html", "anleitung.html", "telefonie.html", "impressum.html", "datenschutz.html", "produktmappe.html", "chatbot.js", "website-profile.mjs", "website-profile-review.mjs", "voices.json", "og-image.png"}
ASSETS = {"audio": {".mp3", ".json"}, "fonts": {".css", ".woff2"}}


class Limits:
    def __init__(self):
        self.lock = threading.Lock()
        self.recent = collections.deque()
        self.slots = threading.BoundedSemaphore(2)

    def acquire(self):
        with self.lock:
            now = time.monotonic()
            while self.recent and self.recent[0] <= now - 86400:
                self.recent.popleft()
            if len(self.recent) >= 30 or sum(x > now - 60 for x in self.recent) >= 6:
                return False
            if not self.slots.acquire(blocking=False):
                return False
            self.recent.append(now)
            return True


def build_server(port, token, scanner=scan_website):
    if not isinstance(token, str) or len(token) < 32 or not token.isascii():
        raise ValueError("Preview token must have at least 32 ASCII characters")
    limits = Limits()

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

        def setup(self):
            super().setup()
            self.connection.settimeout(5)

        def log_message(self, *args):
            # No URL, company data or authorization logging.
            pass

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            super().end_headers()

        def send_json(self, status, payload):
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(data)

        def allowed_host(self):
            return self.headers.get("Host") == f"127.0.0.1:{self.server.server_port}"

        def allowed_asset(self):
            path = urlsplit(self.path).path
            if path == "/":
                self.path = "/index.html"
                return True
            parts = path.lstrip("/").split("/")
            if len(parts) == 1:
                return parts[0] in PAGES
            if len(parts) == 2 and parts[0] in ASSETS:
                file = parts[1]
                return bool(file) and not file.startswith(".") and "%" not in file and "\\" not in file and Path(file).suffix in ASSETS[parts[0]]
            return False

        def do_GET(self):
            if not self.allowed_host():
                return self.send_json(403, {"status":"error","code":"FORBIDDEN"})
            if self.path == "/api/website-profile/status":
                return self.send_json(200, {"status":"ok","mode":"local_preview"})
            if not self.allowed_asset():
                return self.send_json(404, {"status":"error","code":"NOT_FOUND"})
            super().do_GET()

        def do_HEAD(self):
            if not self.allowed_host() or not self.allowed_asset():
                return self.send_json(404, {"status":"error","code":"NOT_FOUND"})
            super().do_HEAD()

        def do_POST(self):
            if self.path != "/api/website-profile":
                return self.send_json(404, {"status":"error","code":"NOT_FOUND"})
            if not self.allowed_host() or self.headers.get("Origin") != f"http://127.0.0.1:{self.server.server_port}":
                return self.send_json(403, {"status":"error","code":"FORBIDDEN"})
            auth = self.headers.get("Authorization", "")
            if not auth.isascii() or len(auth) > 512 or not hmac.compare_digest(auth, "Bearer " + token):
                return self.send_json(401, {"status":"error","code":"UNAUTHORIZED"})
            if self.headers.get("Transfer-Encoding") or self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
                return self.send_json(415, {"status":"error","code":"CONTENT_TYPE"})
            length = self.headers.get("Content-Length", "")
            if not length.isdecimal() or len(length) > 4 or not 1 <= int(length) <= 4096:
                return self.send_json(413, {"status":"error","code":"BODY_LIMIT"})
            try:
                body = json.loads(self.rfile.read(int(length)))
                if not isinstance(body, dict) or set(body) != {"origin"}:
                    raise ValueError()
                target(body["origin"], origin_only=True)
            except (ValueError, OSError, ScanError):
                return self.send_json(400, {"status":"error","code":"TARGET_REFUSED"})
            if not limits.acquire():
                return self.send_json(429, {"status":"error","code":"LIMIT_REACHED"})
            try:
                result = scanner(body["origin"])
            except ScanError as error:
                code = error.code
                return self.send_json(400 if code in {"TARGET_REFUSED","REDIRECT_REFUSED"} else 502, {"status":"error","code":code})
            except Exception:
                return self.send_json(502, {"status":"error","code":"SCAN_FAILED"})
            finally:
                limits.slots.release()
            return self.send_json(200, result)

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    return server


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()
    token = os.environ.get("VOICE_SCAN_TOKEN") or secrets.token_urlsafe(32)
    server = build_server(args.port, token)
    print(f"Local preview: http://127.0.0.1:{server.server_port}/", flush=True)
    if not os.environ.get("VOICE_SCAN_TOKEN"):
        print("Temporary preview access code: " + token, flush=True)
    else:
        print("Use the access code configured in VOICE_SCAN_TOKEN.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
