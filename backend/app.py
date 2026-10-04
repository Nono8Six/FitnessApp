import base64
import hashlib
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.gzip import GZipMiddleware

from poc.server import local_addresses, phone_addresses

from . import __version__
from .api import profiles as profiles_api
from .config import data_dir as resolve_data_dir
from .storage import StorageError, open_database
from .training.profiles import ensure_default_profiles

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"

# Corps des requêtes qui modifient : JSON uniquement, 16 Ko au plus (règle reprise de poc/server.py).
BODY_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
MAX_BODY = 16000

CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; "
       "font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")

MISSING_BUILD_STYLE = """body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#fff;
font:17px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:center}
.title{font-weight:600}.hint{color:rgba(235,235,245,.6)}"""
MISSING_BUILD_CSP = CSP.replace("style-src 'self'", "style-src 'self' 'sha256-" +
                               base64.b64encode(hashlib.sha256(MISSING_BUILD_STYLE.encode()).digest()).decode() + "'")
MISSING_BUILD = """<!doctype html><html lang="fr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Fitness</title>
<style>""" + MISSING_BUILD_STYLE + """</style><body>
<div><p class="title">Interface non construite</p>
<p class="hint">Relancer <code>start-app.ps1</code> sur le PC.</p></div></body></html>"""


def check_body(request: Request) -> JSONResponse | None:
    try:
        size = int(request.headers.get("content-length", "0"))
    except ValueError:
        size = MAX_BODY + 1
    if size > MAX_BODY or request.headers.get("transfer-encoding"):
        return JSONResponse({"detail": "Requête trop volumineuse"}, status_code=413)
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
        return JSONResponse({"detail": "JSON requis"}, status_code=415)
    return None


def create_app(*, simulation: bool = False, data_root: Path | None = None, dist: Path = DIST,
               network_enabled: bool = False) -> FastAPI:
    data = resolve_data_dir(simulation=simulation, root=data_root)
    addresses = phone_addresses()[0] if network_enabled else []
    started_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    # Migrations puis profils par défaut, avant d'accepter la moindre requête.
    database = open_database(data)
    try:
        with database.write() as session:
            ensure_default_profiles(session)
    except Exception as exc:
        database.close()
        raise StorageError(f"Base de données {database.path} : profils par défaut impossibles à créer ({exc}).") from exc

    @asynccontextmanager
    async def lifespan(_app):
        yield
        database.close()

    app = FastAPI(title="Fitness", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.data_dir = data
    app.state.database = database
    app.state.phone_addresses = addresses
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]", *local_addresses()])
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    @app.middleware("http")
    async def protect(request: Request, call_next):
        response = None
        if request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            if origin and urlparse(origin).netloc != request.headers.get("host"):
                response = JSONResponse({"detail": "Origine non autorisée"}, status_code=403)
            elif request.method in BODY_METHODS:
                response = check_body(request)
        if response is None:
            response = await call_next(request)
        if request.url.path.startswith("/assets/") and response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers.setdefault("Content-Security-Policy", CSP)
        return response

    @app.get("/api/health")
    async def health():
        return {
            "app": "Fitness",
            "version": __version__,
            "mode": "simulation" if simulation else "reel",
            "data_dir": str(data),
            "started_at": started_at,
            "schema": database.schema,
            "interface": (dist / "index.html").is_file(),
            "network": {"enabled": network_enabled, "addresses": addresses},
        }

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request, exc: RequestValidationError):
        return JSONResponse({"detail": profiles_api.validation_message(list(exc.errors()))}, status_code=422)

    app.include_router(profiles_api.router)

    @app.api_route("/api/{_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    async def unknown_api(_path: str):
        return JSONResponse({"detail": "Route inconnue"}, status_code=404)

    @app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
    async def index():
        page = dist / "index.html"
        if not page.is_file():
            return HTMLResponse(MISSING_BUILD, status_code=503, headers={"Content-Security-Policy": MISSING_BUILD_CSP})
        return FileResponse(page)

    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    # Fichiers publics à la racine du build (icône), servis par nom exact uniquement.
    public = {
        p.name: p for p in dist.iterdir()
        if p.is_file() and p.name != "index.html" and not p.name.startswith(".")
    } if dist.is_dir() else {}

    @app.api_route("/{name}", methods=["GET", "HEAD"], include_in_schema=False)
    async def root_file(name: str):
        if name in public:
            return FileResponse(public[name])
        return JSONResponse({"detail": "Introuvable"}, status_code=404)

    return app
