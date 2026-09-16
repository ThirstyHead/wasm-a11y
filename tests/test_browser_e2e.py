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

            # Footer landmark & version badge
            footer = page.locator("footer[role='contentinfo']")
            assert footer.is_visible()
            assert "v0.1.7" in footer.inner_text()

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


def test_two_pane_storytelling_flow(server):
    if not HAS_PLAYWRIGHT or sync_playwright is None:
        pytest.skip("Playwright not installed")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(server)
            page.wait_for_load_state("networkidle")

            # Guide banner check
            banner = page.locator("#guide-banner")
            assert banner.is_visible()
            text = banner.text_content() or ""
            assert "Step 1: Add documents on left" in text

            # Pane Before check
            pane_before = page.locator("#pane-before")
            assert pane_before.is_visible()
            text_before = pane_before.text_content() or ""
            assert "Step 1: Before: Original Documents" in text_before

            # Center bridge check
            center_bridge = page.locator("#center-bridge")
            assert center_bridge.is_visible()
            remediate_btn = page.locator("#btn-remediate-primary")
            assert remediate_btn.is_visible()
            assert "Step 2: Fix & Audit" in (remediate_btn.text_content() or "")
            assert page.evaluate("document.getElementById('btn-remediate-primary').hasAttribute('disabled')")

            # Pane After check
            pane_after = page.locator("#pane-after")
            assert pane_after.is_visible()
            text_after = pane_after.text_content() or ""
            assert "Step 3: After: Remediated Files & Reports" in text_after

            # Report dialog check
            report_dialog = page.locator("#report-dialog")
            assert report_dialog.count() == 1

            browser.close()
    except Exception as exc:
        if "Executable doesn't exist" in str(exc):
            pytest.skip("Playwright chromium browser not installed in this environment")
        raise


def test_pyodide_worker_initialization_and_remediation(server, tmp_path):
    if not HAS_PLAYWRIGHT or sync_playwright is None:
        pytest.skip("Playwright not installed")
    try:
        # Create minimal test PDF
        test_pdf = tmp_path / "sample-test.pdf"
        try:
            import pypdf
            writer = pypdf.PdfWriter()
            writer.add_blank_page(width=72, height=72)
            writer.add_metadata({"/Title": "Sample Document Title"})
            with open(test_pdf, "wb") as f:
                writer.write(f)
        except ImportError:
            test_pdf.write_bytes(
                b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
                b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
                b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>\nendobj\n"
                b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n"
                b"trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n186\n%%EOF\n"
            )

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            console_warnings = []
            page.on("console", lambda msg: console_warnings.append(msg.text) if msg.type in ("warning", "error") else None)
            page.goto(server)

            # Wait for Pyodide worker initialization
            status = page.locator("#progress-status")
            ready = False
            for _ in range(60):
                txt = status.inner_text().lower()
                if "engine ready" in txt:
                    ready = True
                    break
                time.sleep(1)
            assert ready, f"Pyodide failed to reach Ready status: {status.inner_text()}"

            # Upload test PDF
            file_input = page.locator("#file-input")
            file_input.set_input_files(str(test_pdf))
            time.sleep(0.5)

            # Click Fix & Audit
            remediate_btn = page.locator("#btn-remediate-primary")
            remediate_btn.click()

            # Wait for remediation completion
            complete = False
            for _ in range(60):
                txt = status.inner_text().lower()
                if "complete" in txt:
                    complete = True
                    break
                time.sleep(1)

            assert complete, f"Remediation did not complete: {status.inner_text()}"
            error_banner = page.locator("#error-banner")
            assert not error_banner.is_visible()

            # Results view should be visible
            after_results = page.locator("#after-results-view")
            assert after_results.is_visible()
            assert "sample-test_remediated.pdf" in page.locator("#after-filename").inner_text()

            # Remediated download button is enabled
            download_btn = page.locator("#download-remediated-btn")
            assert not download_btn.is_disabled()

            # View report modal dialog and verify accurate WCAG SC criteria mapping
            view_report_btn = page.locator("#view-report-btn")
            view_report_btn.click()
            report_dialog = page.locator("#report-dialog")
            assert report_dialog.is_visible()
            report_body = page.locator("#report-dialog-body")
            body_text = report_body.inner_text()
            assert "Language of Page" in body_text or "3.1.1" in body_text
            assert "Info and Relationships" in body_text or "1.3.1" in body_text
            assert "0 of 2 barriers (0.0% improvement)" not in body_text
            assert "Great progress! You have resolved 0" not in body_text

            # Verify no spurious pypdf or Pyodide xref warning logs polluted the console
            pypdf_warnings = [w for w in console_warnings if "Ignoring wrong pointing object" in w]
            assert len(pypdf_warnings) == 0, f"Spurious pypdf console warnings detected: {pypdf_warnings}"

            browser.close()
    except Exception as exc:
        if "Executable doesn't exist" in str(exc):
            pytest.skip("Playwright chromium browser not installed in this environment")
        raise

