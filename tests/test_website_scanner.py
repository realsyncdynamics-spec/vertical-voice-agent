import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scanner"))
import unittest
import json
import threading
import urllib.request
import urllib.error
from website_scanner import scan_website, ScanError, public_ip, target
from preview_server import build_server

HTML = """<html><title>Testbetrieb</title><script type="application/ld+json">{"@type":"Plumber","name":"Testbetrieb","telephone":"+49 123","openingHours":"Mo-Fr 08:00-17:00","makesOffer":{"itemOffered":{"@type":"Service","name":"Wartung"}}}</script></html>"""
ORIGIN = "https://example.de"
def resolver(host,deadline): return ["93.184.216.34"]
def requester(u,ip,deadline): return 200,None,HTML

class ScannerTests(unittest.TestCase):
    def test_extraction(self):
        profile=scan_website(ORIGIN,resolver,requester)
        self.assertEqual(profile["status"],"ok")
        self.assertTrue({"business_name","industry","opening_hours","services","public_contact"}.issubset({x["field"] for x in profile["candidates"]}))
    def test_private_addresses(self):
        for ip in ["127.0.0.1","10.0.0.1","169.254.169.254","::1","::ffff:8.8.8.8","2002::1","ff02::1","100.64.0.1"]:
            self.assertFalse(public_ip(ip),ip)
    def test_mixed_dns(self):
        with self.assertRaises(ScanError):
            scan_website(ORIGIN,lambda h,d:["93.184.216.34","127.0.0.1"],lambda *a:self.fail("network access"))
    def test_cross_site_redirect(self):
        with self.assertRaises(ScanError):
            scan_website(ORIGIN,resolver,lambda *a:(302,"https://other.de",None))
    def test_pin(self):
        calls=[]
        def fetch(u,ip,d):
            calls.append(ip)
            return 200,None,HTML
        scan_website(ORIGIN,resolver,fetch)
        self.assertEqual(calls,["93.184.216.34"])
    def test_invalid_target(self):
        for url in ["https://127.0.0.1","https://user@example.de","https://example.de:81","https://example.de/path","https://example.de?x=1","https://a.internal"]:
            with self.assertRaises(ScanError): target(url,True)
    def test_api(self):
        token="a"*40
        server=build_server(0,token,lambda origin:scan_website(origin,resolver,requester))
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        base=f"http://127.0.0.1:{server.server_port}"
        def request(code):
            req=urllib.request.Request(base+"/api/website-profile",data=json.dumps({"origin":ORIGIN}).encode(),headers={"Origin":base,"Content-Type":"application/json","Authorization":"Bearer "+code})
            return urllib.request.urlopen(req,timeout=5)
        try:
            with self.assertRaises(urllib.error.HTTPError) as cm: request("wrong")
            self.assertEqual(cm.exception.code,401)
            with request(token) as response:
                self.assertEqual(json.load(response)["candidates"][0]["value"],"Testbetrieb")
        finally: server.shutdown();server.server_close()

if __name__=="__main__": unittest.main()
