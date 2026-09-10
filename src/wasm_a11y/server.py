"""Local HTTP server for wasm-a11y with COOP/COEP headers for WebAssembly."""

import http.server
import socket
import threading
from functools import partial
from pathlib import Path
from typing import Optional

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
PUBLIC_DIR = ROOT_DIR / "public"


class WasmStudioHandler(http.server.SimpleHTTPRequestHandler):
    """Simple HTTP Request Handler adding Cross-Origin isolation headers for WASM."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def end_headers(self):
        # Enable Cross-Origin Isolation for high-performance WebAssembly
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, format, *args):
        # Allow quiet mode
        if getattr(self.server, "quiet", False):
            return
        super().log_message(format, *args)


def find_free_port() -> int:
    """Find a free TCP port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        s.listen(1)
        port = s.getsockname()[1]
    return port


def run_server(
    port: int = 8080,
    host: str = "127.0.0.1",
    stop_event: Optional[threading.Event] = None,
    quiet: bool = False,
):
    """Run HTTP server until stop_event is set or KeyboardInterrupt."""
    server_address = (host, port)
    httpd = http.server.HTTPServer(server_address, WasmStudioHandler)
    httpd.quiet = quiet  # type: ignore[attr-defined]

    if stop_event:
        while not stop_event.is_set():
            httpd.handle_request()
    else:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            httpd.server_close()
