"""Source-backed website scanning. No browser execution, model calls or persistence."""
import http.client
import ipaddress
import json
import queue
import re
import socket
import ssl
import threading
import time
from html.parser import HTMLParser
from urllib.parse import urlsplit, urljoin, urlunsplit

MAX_BYTES = 1_500_000
MAX_REDIRECTS = 5
TIMEOUT = 12
DNS_SLOTS = threading.BoundedSemaphore(4)
FIELDS = {"business_name", "industry", "services", "opening_hours", "public_contact", "faq"}
LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", re.I)


class ScanError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def remaining(deadline):
    left = deadline - time.monotonic()
    if left <= 0:
        raise ScanError("TIMEOUT")
    return left


def target(value, origin_only=False):
    if not isinstance(value, str) or not value or len(value) > 2048 or any(c.isspace() or ord(c) < 32 for c in value) or "\\" in value:
        raise ScanError("TARGET_REFUSED")
    try:
        u = urlsplit(value)
        host = u.hostname or ""
        port = u.port
    except ValueError:
        raise ScanError("TARGET_REFUSED") from None
    if u.scheme not in ("http", "https") or u.username is not None or u.password is not None or port is not None:
        raise ScanError("TARGET_REFUSED")
    labels = host.split(".")
    if len(host) > 253 or len(labels) < 2 or not all(LABEL.fullmatch(x) for x in labels) or not re.fullmatch(r"[a-z]{2,63}", labels[-1], re.I):
        raise ScanError("TARGET_REFUSED")
    if labels[-1] in {"localhost", "local", "internal", "test", "invalid", "onion"} or host.endswith(".home.arpa"):
        raise ScanError("TARGET_REFUSED")
    if u.query or u.fragment or (origin_only and (u.path or value != f"{u.scheme}://{host}")):
        raise ScanError("TARGET_REFUSED")
    return u


def origin_of(u):
    return f"{u.scheme}://{u.hostname}"


def same_site(initial, current):
    # Only exact hostname or its www alias, and never an HTTPS downgrade.
    bare = lambda h: h[4:] if h.startswith("www.") else h
    return bare(initial.hostname) == bare(current.hostname) and not (initial.scheme == "https" and current.scheme != "https")


def public_ip(value):
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False
    if not ip.is_global or ip.is_multicast or ip.is_reserved or ip.is_loopback or ip.is_link_local or ip.is_unspecified:
        return False
    if ip.version == 6:
        # Reject mapped, transition and non-global-unicast ranges explicitly.
        if ip.ipv4_mapped or ip.sixtofour or ip.teredo or ip.is_site_local or ip not in ipaddress.ip_network("2000::/3"):
            return False
        if ip in ipaddress.ip_network("2001::/23"):
            return False
    return True


def resolve(host, deadline):
    if not DNS_SLOTS.acquire(blocking=False):
        raise ScanError("DNS_BUSY")
    result = queue.Queue(maxsize=1)

    def work():
        try:
            infos = socket.getaddrinfo(host + ".", None, socket.AF_UNSPEC, socket.SOCK_STREAM)
            result.put((True, [item[4][0] for item in infos]))
        except Exception:
            result.put((False, []))
        finally:
            DNS_SLOTS.release()

    threading.Thread(target=work, daemon=True).start()
    try:
        ok, addresses = result.get(timeout=remaining(deadline))
    except queue.Empty:
        raise ScanError("TIMEOUT") from None
    if not ok:
        raise ScanError("DNS_FAILED")
    return addresses


def checked_addresses(host, deadline, resolver):
    addresses = list(dict.fromkeys(resolver(host, deadline)))
    remaining(deadline)
    if not addresses or len(addresses) > 32 or not all(public_ip(ip) for ip in addresses):
        raise ScanError("TARGET_REFUSED")
    return addresses


def pinned_request(u, address, deadline):
    """Connect directly to the verified address; TLS still verifies original hostname."""
    if not public_ip(address):
        raise ScanError("TARGET_REFUSED")
    ip = ipaddress.ip_address(address)
    family = socket.AF_INET if ip.version == 4 else socket.AF_INET6
    port = 443 if u.scheme == "https" else 80
    raw = socket.socket(family, socket.SOCK_STREAM)
    sock = raw
    conn = None
    timer = None
    try:
        raw.settimeout(remaining(deadline))
        raw.connect((str(ip), port) if ip.version == 4 else (str(ip), port, 0, 0))
        if u.scheme == "https":
            raw.settimeout(remaining(deadline))
            sock = ssl.create_default_context().wrap_socket(raw, server_hostname=u.hostname)
        sock.settimeout(remaining(deadline))

        def stop():
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            sock.close()

        timer = threading.Timer(remaining(deadline), stop)
        timer.daemon = True
        timer.start()
        conn = http.client.HTTPConnection(u.hostname, port=port, timeout=remaining(deadline))
        conn.sock = sock
        # Never let http.client establish a second, DNS-resolved connection.
        def no_reconnect():
            raise ScanError("NETWORK_FAILED")
        conn.connect = no_reconnect
        path = u.path or "/"
        conn.request("GET", path, headers={
            "Host": u.hostname,
            "User-Agent": "RealSync-Voice-Profile/1.0",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Encoding": "identity",
            "Connection": "close",
        })
        response = conn.getresponse()
        status = response.status
        if status in (301, 302, 303, 307, 308):
            return status, response.getheader("Location"), None
        if status != 200:
            raise ScanError("HTTP_STATUS")
        content_type = response.getheader("Content-Type", "").split(";")[0].strip().lower()
        if content_type not in ("text/html", "application/xhtml+xml"):
            raise ScanError("CONTENT_TYPE")
        if response.getheader("Content-Encoding", "identity").strip().lower() not in ("", "identity"):
            raise ScanError("CONTENT_ENCODING")
        length = response.getheader("Content-Length")
        if length is not None and (not length.isdecimal() or int(length) > MAX_BYTES):
            raise ScanError("TOO_LARGE")
        body = bytearray()
        while True:
            remaining(deadline)
            chunk = response.read1(min(65536, MAX_BYTES + 1 - len(body)))
            if not chunk:
                break
            body.extend(chunk)
            if len(body) > MAX_BYTES:
                raise ScanError("TOO_LARGE")
        remaining(deadline)
        if length is not None and len(body) != int(length):
            raise ScanError("NETWORK_FAILED")
        charset = re.search(r"charset\s*=\s*['\"]?([a-zA-Z0-9_-]+)", response.getheader("Content-Type", ""))
        encoding = charset.group(1).lower() if charset else "utf-8"
        if encoding not in {"utf-8", "utf8", "iso-8859-1", "latin-1", "windows-1252", "cp1252", "us-ascii"}:
            encoding = "utf-8"
        return status, None, body.decode(encoding, errors="replace")
    except ScanError:
        raise
    except (OSError, ValueError, UnicodeError, http.client.HTTPException):
        if time.monotonic() >= deadline:
            raise ScanError("TIMEOUT") from None
        raise ScanError("NETWORK_FAILED") from None
    finally:
        if timer:
            timer.cancel()
        if conn:
            conn.close()
        sock.close()
        raw.close()


def clean(value, limit=1000):
    return " ".join(value.split())[:limit] if isinstance(value, str) else ""


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.mode = None
        self.parts = []
        self.title = ""
        self.site_name = ""
        self.contacts = []
        self.structured = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script":
            self.mode = "json" if (attrs.get("type") or "").lower().split(";")[0].strip() == "application/ld+json" else "ignore"
            self.parts = []
        elif tag in ("style", "noscript", "template"):
            self.mode = "ignore"
            self.parts = []
        elif self.mode is None:
            if tag == "title":
                self.mode = "title"
                self.parts = []
            elif tag == "meta" and (attrs.get("property") or "").lower() == "og:site_name":
                self.site_name = clean(attrs.get("content"), 200)
            elif tag == "a":
                href = attrs.get("href") or ""
                if href.lower().startswith(("tel:", "mailto:")) and "?" not in href and len(self.contacts) < 20:
                    self.contacts.append(clean(href, 200))

    def handle_data(self, data):
        if self.mode in ("json", "title"):
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.mode in ("json", "ignore"):
            if self.mode == "json" and len(self.structured) < 30:
                try:
                    self.structured.append(json.loads("".join(self.parts)))
                except (ValueError, RecursionError):
                    pass
            self.mode = None
            self.parts = []
        elif tag in ("style", "noscript", "template") and self.mode == "ignore":
            self.mode = None
        elif tag == "title" and self.mode == "title":
            self.title = clean("".join(self.parts), 200)
            self.mode = None
            self.parts = []


BUSINESS_TYPES = {"Organization", "LocalBusiness", "Corporation", "ProfessionalService", "HomeAndConstructionBusiness", "Plumber", "Electrician", "HVACBusiness", "RoofingContractor", "AutoRepair", "AutomotiveBusiness", "Restaurant", "Bakery", "FoodEstablishment", "Store", "LegalService", "Attorney", "Dentist", "MedicalBusiness", "Physician", "AccountingService", "RealEstateAgent"}
TYPE_NAMES = {"Plumber":"Sanitär / Handwerk","Electrician":"Elektrohandwerk","HVACBusiness":"Heizung / Klima","RoofingContractor":"Dachdecker","AutoRepair":"KFZ-Werkstatt","Restaurant":"Gastronomie","Bakery":"Bäckerei","LegalService":"Rechtsdienstleistungen","Attorney":"Kanzlei","Dentist":"Zahnarztpraxis","Physician":"Arztpraxis","AccountingService":"Buchhaltung / Steuerberatung","RealEstateAgent":"Immobilien"}


def objects(value):
    # Traverse only schema graph containers, not arbitrary unrelated embedded data.
    pending = [(value, 0)]
    count = 0
    while pending and count < 300:
        item, depth = pending.pop()
        count += 1
        if depth > 12:
            continue
        if isinstance(item, list):
            pending.extend((x, depth + 1) for x in reversed(item[:100]))
        elif isinstance(item, dict):
            yield item
            for key in ("@graph", "mainEntity", "itemListElement", "itemOffered", "hasOfferCatalog", "makesOffer"):
                if key in item:
                    pending.append((item[key], depth + 1))


def types(obj):
    raw = obj.get("@type", [])
    raw = [raw] if isinstance(raw, str) else raw
    return {v.rsplit("/", 1)[-1] for v in raw[:20] if isinstance(v, str)} if isinstance(raw, list) else set()


def extract_profile(html, source_url, requested_origin):
    parser = Page()
    try:
        parser.feed(html)
        parser.close()
    except (ValueError, RecursionError):
        raise ScanError("HTML_INVALID") from None
    candidates, seen = [], set()

    def add(field, value, evidence):
        value = clean(value, 200 if field == "business_name" else 1000)
        evidence = clean(evidence, 1000)
        key = (field, value.casefold())
        if field in FIELDS and value and evidence and key not in seen and len(candidates) < 40:
            seen.add(key)
            candidates.append({"field": field, "value": value, "source_url": source_url, "evidence": evidence})

    for doc in parser.structured:
        for obj in objects(doc):
            kinds = types(obj)
            if kinds & BUSINESS_TYPES:
                add("business_name", obj.get("name"), "JSON-LD name")
                add("industry", obj.get("industry"), "JSON-LD industry")
                for kind in sorted(kinds & TYPE_NAMES.keys()):
                    add("industry", TYPE_NAMES[kind], "JSON-LD @type: " + kind)
                raw = obj.get("openingHours")
                for value in ([raw] if isinstance(raw, str) else raw[:14] if isinstance(raw, list) else []):
                    add("opening_hours", value, "JSON-LD openingHours")
                spec = obj.get("openingHoursSpecification", [])
                for item in ([spec] if isinstance(spec, dict) else spec[:14] if isinstance(spec, list) else []):
                    if isinstance(item, dict):
                        day = item.get("dayOfWeek", [])
                        day = [day] if isinstance(day, str) else day
                        days = ", ".join(x.rsplit("/", 1)[-1] for x in day[:7] if isinstance(x, str)) if isinstance(day, list) else ""
                        opens, closes = clean(item.get("opens"), 20), clean(item.get("closes"), 20)
                        if days and opens and closes:
                            add("opening_hours", f"{days} {opens}–{closes}", "JSON-LD openingHoursSpecification")
                for field in ("telephone", "email"):
                    add("public_contact", obj.get(field), "JSON-LD " + field)
            if "Service" in kinds:
                add("services", obj.get("name") or obj.get("serviceType"), "JSON-LD Service")
            if "Question" in kinds:
                question = clean(obj.get("name"), 300)
                answer = obj.get("acceptedAnswer")
                if question and isinstance(answer, dict) and clean(answer.get("text")):
                    add("faq", question + " — " + clean(answer["text"], 650), "JSON-LD Question / acceptedAnswer")

    if not any(x["field"] == "business_name" for x in candidates):
        if parser.site_name:
            add("business_name", parser.site_name, "HTML meta og:site_name")
        elif parser.title:
            add("business_name", parser.title, "HTML title – mögliche Bezeichnung, bitte prüfen")
    for contact in parser.contacts:
        add("public_contact", contact, "Öffentlicher HTML-Kontaktlink")
    from datetime import datetime, timezone
    return {"status":"ok", "source_origin":requested_origin, "observed_at":datetime.now(timezone.utc).isoformat(), "candidates":candidates}


def scan_website(origin, resolver=resolve, requester=pinned_request):
    start = target(origin, origin_only=True)
    current = start
    deadline = time.monotonic() + TIMEOUT
    for hop in range(MAX_REDIRECTS + 1):
        addresses = checked_addresses(current.hostname, deadline, resolver)
        # Exactly one checked address per hop; no automatic retries or fresh DNS at connect.
        status, location, html = requester(current, addresses[0], deadline)
        remaining(deadline)
        if status in (301, 302, 303, 307, 308):
            if not location or hop == MAX_REDIRECTS:
                raise ScanError("REDIRECT_LIMIT")
            next_url = target(urljoin(current.geturl(), location))
            if not same_site(start, next_url):
                raise ScanError("REDIRECT_REFUSED")
            current = next_url
            continue
        if status != 200 or not isinstance(html, str) or len(html.encode("utf-8")) > MAX_BYTES * 4:
            raise ScanError("CONTENT_INVALID")
        return extract_profile(html, urlunsplit((current.scheme, current.netloc, current.path or "/", "", "")), origin)
    raise ScanError("REDIRECT_LIMIT")
