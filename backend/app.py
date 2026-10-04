from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from poc.server import local_addresses, phone_addresses

from . import __version__
from .config import data_dir as resolve_data_dir

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"

CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; "
       "font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")

MISSING_BUILD = """<!doctype html><html lang="fr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Fitness</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#fff;
font:17px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:center">
<div><p style="font-weight:600">Interface non construite</p>
<p style="color:rgba(235,235,245,.6)">Relancer <code>start-app.ps1</code> sur le PC.</p></div></body></html>"""


def create_app(*, simulation: bool = False, data_root: Path | None = None, dist: Path = DIST,
               network_enabled: bool = False) -> FastAPI:
    data = resolve_data_dir(simulation=simulation, root=data_root)
    addresses = phone_addresses()[0] if network_enabled else []
    started_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    app = FastAPI(title="Fitness", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.data_dir = data
    app.state.phone_addresses = addresses
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]", *local_addresses()])

    @app.middleware("http")
    async def protect(request: Request, call_next):
        if request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            if origin and urlparse(origin).netloc != request.headers.get("host"):
                return JSONResponse({"detail": "Origine non autorisée"}, status_code=403)
        response = await call_next(request)
        if request.url.path.startswith("/assets/") and response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = CSP
        return response

    @app.get("/api/health")
    async def health():
        return {
            "app": "Fitness",
            "version": __version__,
            "mode": "simulation" if simulation else "reel",
            "data_dir": str(data),
            "started_at": started_at,
            "interface": (dist / "index.html").is_file(),
            "network": {"enabled": network_enabled, "addresses": addresses},
        }

    @app.api_route("/api/{_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    async def unknown_api(_path: str):
        return JSONResponse({"detail": "Route inconnue"}, status_code=404)

    @app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
    async def index():
        page = dist / "index.html"
        if not page.is_file():
            return HTMLResponse(MISSING_BUILD, status_code=503)
        return FileResponse(page)

    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    # Fichiers publics à la racine du build (icône), servis par nom exact uniquement.
    public = {p.name: p for p in dist.iterdir() if p.is_file() and p.name != "index.html"} if dist.is_dir() else {}

    @app.api_route("/{name}", methods=["GET", "HEAD"], include_in_schema=False)
    async def root_file(name: str):
        if name in public:
            return FileResponse(public[name])
        return JSONResponse({"detail": "Introuvable"}, status_code=404)

    return app
