"""Answers plain-HTTP requests on the tailnet (e.g. http://anime/) with a redirect to the HTTPS app."""
import http.server
import os

TARGET = "https://" + os.environ.get("ANIME_HOST", "localhost")


class Redirect(http.server.BaseHTTPRequestHandler):
    def _go(self):
        self.send_response(301)
        self.send_header("Location", TARGET + self.path)
        self.send_header("Content-Length", "0")
        self.end_headers()

    do_GET = do_HEAD = do_POST = _go

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", 8002), Redirect).serve_forever()
