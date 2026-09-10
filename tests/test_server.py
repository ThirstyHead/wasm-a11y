import http.client
import threading
import time
from pathlib import Path
import pytest
from wasm_a11y.server import run_server, find_free_port


def test_find_free_port():
    port = find_free_port()
    assert isinstance(port, int)
    assert 1024 < port < 65535


def test_server_serves_index_and_coop_coep_headers():
    port = find_free_port()
    stop_event = threading.Event()
    server_thread = threading.Thread(
        target=run_server,
        kwargs={"port": port, "stop_event": stop_event, "quiet": True},
        daemon=True,
    )
    server_thread.start()
    time.sleep(0.3)

    try:
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
        conn.request("GET", "/")
        resp = conn.getresponse()
        assert resp.status == 200
        headers = dict(resp.getheaders())

        # Check COOP / COEP headers for WebAssembly SharedArrayBuffer support
        assert headers.get("Cross-Origin-Opener-Policy") == "same-origin"
        assert headers.get("Cross-Origin-Embedder-Policy") == "require-corp"

        body = resp.read().decode("utf-8")
        assert "wasm-a11y" in body
        assert "Document Accessibility Studio" in body
    finally:
        stop_event.set()
        # Ping server once to release handle if blocked on handle_request
        try:
            conn2 = http.client.HTTPConnection("127.0.0.1", port, timeout=1)
            conn2.request("GET", "/")
            conn2.getresponse()
        except Exception:
            pass
        server_thread.join(timeout=2)
