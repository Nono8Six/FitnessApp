"""Accès temporaire au vrai Direct, avec un runtime simulé et des données jetables."""

import asyncio
import logging
import tempfile
from contextlib import AsyncExitStack
from pathlib import Path

from fastapi.responses import JSONResponse

LOGGER = logging.getLogger(__name__)


class CourseTest:
    """Créé au premier accès uniquement ; fermé avec le serveur principal."""

    def __init__(self, dist):
        self.dist = dist
        self.app = None
        self.lock = asyncio.Lock()
        self.stack = None

    async def __call__(self, scope, receive, send):
        async with self.lock:
            if self.app is None:
                from .app import create_app

                stack = AsyncExitStack()
                try:
                    root = stack.enter_context(tempfile.TemporaryDirectory(prefix="fitness-course-test-"))
                    app = create_app(simulation=True, data_root=Path(root), dist=self.dist, course_test=True)
                    await stack.enter_async_context(app.router.lifespan_context(app))
                except Exception:
                    await stack.aclose()
                    LOGGER.exception("Initialisation du test de course impossible")
                    if scope["type"] == "websocket":
                        await send({"type": "websocket.close", "code": 1011})
                    else:
                        await JSONResponse({"detail": "Le test de course est indisponible. Réessayez."}, status_code=503)(scope, receive, send)
                    return
                self.app, self.stack = app, stack
        await self.app(scope, receive, send)

    async def close(self):
        if self.stack:
            await self.stack.aclose()
            self.app = self.stack = None
