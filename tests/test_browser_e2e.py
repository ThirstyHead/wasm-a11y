import threading
import time
import pytest
from wasm_a11y.server import run_server, find_free_port

try:
    from playwright.sync_api import sync_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False
    sync_playwright = None  # type: ignore


@pytest.fixture(scope="module")
def server():
    port = find_free_port()
    stop_event = threading.Event()
    thread = threading.Thread(
        target=run_server,
        kwargs={"port": port, "stop_event": stop_event, "quiet": True},
        daemon=True,
    )
    thread.start()
    time.sleep(0.3)
    yield f"http://127.0.0.1:{port}"
    stop_event.set()
    thread.join(timeout=2)


def test_landing_page_dom_and_a11y(server):
    if not HAS_PLAYWRIGHT or sync_playwright is None:
        pytest.skip("Playwright not installed")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(server)

            # Title and header
            assert "wasm-a11y" in page.title()
            header = page.locator("header[role='banner']")
            assert header.is_visible()

            # Trust badge
            trust_badge = page.locator(".m-trust-badge")
            assert trust_badge.is_visible()
            assert "Zero Server Upload" in trust_badge.inner_text()

            # Skip link
            skip_link = page.locator(".u-skip-link")
            assert skip_link.get_attribute("href") == "#main-content"

            # Main landmark & dropzone
            main = page.locator("main#main-content")
            assert main.is_visible()
            dropzone = page.locator("#dropzone")
            assert dropzone.is_visible()

            # Check file input accept attribute
            file_input = page.locator("#file-input")
            assert file_input.get_attribute("accept") == ".docx,.pptx,.xlsx,.pdf"

            # Footer landmark
            footer = page.locator("footer[role='contentinfo']")
            assert footer.is_visible()

            browser.close()
    except Exception as exc:
        if "Executable doesn't exist" in str(exc):
            pytest.skip("Playwright chromium browser not installed in this environment")
        raise


def test_keyboard_navigation_focus(server):
    if not HAS_PLAYWRIGHT or sync_playwright is None:
        pytest.skip("Playwright not installed")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(server)

            # Press Tab -> skip link should be focused
            page.keyboard.press("Tab")
            assert page.evaluate("document.activeElement.classList.contains('u-skip-link')")

            # Press Tab -> dropzone or browse button
            page.keyboard.press("Tab")
            active_id = page.evaluate("document.activeElement.id")
            assert active_id in ("dropzone", "file-input", "browse-btn")

            browser.close()
    except Exception as exc:
        if "Executable doesn't exist" in str(exc):
            pytest.skip("Playwright chromium browser not installed in this environment")
        raise


def test_zero_third_party_telemetry(server):
    if not HAS_PLAYWRIGHT or sync_playwright is None:
        pytest.skip("Playwright not installed")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            unauthorized_requests = []

            def handle_request(req):
                url = req.url
                # Allow only local server and pyodide cdn
                allowed_prefixes = (
                    server,
                    "https://cdn.jsdelivr.net",
                    "https://pypi.org",
                    "https://files.pythonhosted.org",
                )
                if not any(url.startswith(pfx) for pfx in allowed_prefixes):
                    unauthorized_requests.append(url)

            page.on("request", handle_request)
            page.goto(server)
            page.wait_for_load_state("networkidle")

            assert len(unauthorized_requests) == 0, f"Detected unexpected egress: {unauthorized_requests}"
            browser.close()
    except Exception as exc:
        if "Executable doesn't exist" in str(exc):
            pytest.skip("Playwright chromium browser not installed in this environment")
        raise
