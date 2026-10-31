import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import auth
from .config import get_settings
from .migrations import upgrade_db
from .routers import clients, dashboard, invoices, quotes, recurring, settings as settings_router
from .services.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("facturation")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.admin_password == "changeme":
        log.warning("ADMIN_PASSWORD n'est pas défini : mot de passe par défaut « changeme » !")
    upgrade_db()
    start_scheduler()
    yield
    stop_scheduler()


def create_app() -> FastAPI:
    app = FastAPI(title="Facturation", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")

    protected = [Depends(auth.require_auth)]
    app.include_router(auth.router)
    app.include_router(quotes.public_router)
    for r in (clients.router, invoices.router, quotes.router, recurring.router, settings_router.router, dashboard.router):
        app.include_router(r, dependencies=protected)

    @app.get("/api/health")
    def health():
        return {"ok": True}

    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE"], include_in_schema=False)
    def api_not_found(path: str):
        return JSONResponse({"detail": "Route inconnue"}, status_code=404)

    # Front React compilé (production) : fichiers statiques + fallback SPA.
    dist = get_settings().frontend_dist
    if dist.exists():
        if (dist / "assets").exists():
            app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            candidate = (dist / path).resolve()
            if path and candidate.is_file() and dist.resolve() in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
