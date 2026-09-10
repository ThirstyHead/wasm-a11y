"""Command line interface for launching wasm-a11y studio."""

import argparse
import sys
import webbrowser
from wasm_a11y.server import run_server, find_free_port


def main():
    parser = argparse.ArgumentParser(description="wasm-a11y: Zero-Install Document Accessibility Studio")
    parser.add_argument("--port", type=int, default=8080, help="Port to bind (default: 8080)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host interface (default: 127.0.0.1)")
    parser.add_argument("--no-browser", action="store_true", help="Do not auto-open browser")
    args = parser.parse_args()

    port = args.port
    url = f"http://{args.host}:{port}"
    print(f"🚀 Starting wasm-a11y studio at {url}")
    print("🔒 100% Client-Side WebAssembly. Documents never leave your device.")

    if not args.no_browser:
        webbrowser.open(url)

    try:
        run_server(port=port, host=args.host)
    except OSError:
        # Port might be in use, pick another
        port = find_free_port()
        url = f"http://{args.host}:{port}"
        print(f"Port was in use; restarting on {url}...")
        if not args.no_browser:
            webbrowser.open(url)
        run_server(port=port, host=args.host)


if __name__ == "__main__":
    main()
