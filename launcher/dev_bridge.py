"""Pont de développement Chrome, opt-in, boucle locale uniquement.

La fenêtre distribuée utilise directement l'IPC Tauri. Ce serveur n'est jamais
lancé par le lanceur normal ; il permet de vérifier la même supervision Rust.
"""
import json
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BINARY = ROOT / "launcher" / "bin" / "Fitness Launcher.exe"
ORIGINS = {"http://127.0.0.1:5175", "http://localhost:5175"}
COMMANDS = {"get_snapshot", "start_server", "stop_server", "open_app"}


class RustBridge:
    def __init__(self, env=None):
        self.lock = threading.Lock()
        self.closed = False
        self.process = subprocess.Popen(
            [str(BINARY), "--diagnostic"], cwd=ROOT, stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            encoding="utf-8", creationflags=subprocess.CREATE_NO_WINDOW, env=env,
        )

    def invoke(self, request):
        with self.lock:
            if self.closed or self.process.poll() is not None:
                raise RuntimeError("Le superviseur Rust s'est arrêté.")
            self.process.stdin.write(json.dumps(request) + "\n")
            self.process.stdin.flush()
            response = self.process.stdout.readline()
            if not response:
                raise RuntimeError("Réponse du superviseur absente.")
            return json.loads(response)

    def close(self):
        with self.lock:
            if self.closed:
                return
            self.closed = True
            self.process.stdin.close()  # EOF : arrêt supervisé, comme la fermeture de la fenêtre.
        try:
            self.process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            self.process.kill()  # Le Job Windows ferme alors tous les enfants détenus.
            self.process.wait(timeout=5)
        finally:
            self.process.stdout.close()
            self.process.stderr.close()


def serve():
    bridge = RustBridge()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if (self.path != "/__launcher" or self.headers.get("Host") != "127.0.0.1:4391"
                        or self.headers.get("Origin") not in ORIGINS
                        or self.headers.get("Content-Type") != "application/json"
                        or self.headers.get("Transfer-Encoding") or not 0 < size <= 1024):
                    self.send_error(403, "Requete refusee")
                    return
                request = json.loads(self.rfile.read(size))
                if not isinstance(request, dict) or request.get("command") not in COMMANDS:
                    self.send_error(400, "Commande invalide")
                    return
                result = bridge.invoke(request)
            except (ValueError, RuntimeError, OSError) as exc:
                result = {"error": str(exc)}
            body = json.dumps(result).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, _format, *_args):
            pass

    try:
        with ThreadingHTTPServer(("127.0.0.1", 4391), Handler) as server:
            print("Pont Rust : http://127.0.0.1:4391 — UI : npm run dev:launcher", flush=True)
            server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        bridge.close()


if __name__ == "__main__":
    serve()
