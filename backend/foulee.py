"""Synchronisation du bilan local vers le journal privé de Foulée."""
import argparse
import asyncio
import getpass
import logging
import re
import sys
import warnings
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import httpx2 as httpx
from cryptography.exceptions import UnsupportedAlgorithm
from sqlalchemy import func, or_, select
from sqlalchemy.exc import SQLAlchemyError

from .coach.vault import Vault, VaultError
from .config import data_dir
from .foulee_browser import BrowserDelivery, BrowserDeliveryError, BrowserSettings
from .recording.metrics import Distance
from .storage import Database
from .storage.models import RecordedEntry, RecordedSession
from .training.profiles import utc_now

LOGGER = logging.getLogger(__name__)
ENDPOINT = "https://foulee-objectif-arnaud.nono8six.chatgpt.site/api/integrations/fitnessapp/sessions"
PROFILE_ID = "arnaud"
POLL_SECONDS = 3


@dataclass(frozen=True)
class Settings:
    token: str = field(repr=False)
    enabled_at: str

    def __post_init__(self):
        if not re.fullmatch(r"[\x21-\x7e]{1,8192}", self.token):
            raise ValueError("Jeton d’accès Foulée invalide.")
        if datetime.fromisoformat(self.enabled_at).tzinfo is None:
            raise ValueError("Date d’activation Foulée invalide.")


def read_settings(directory: Path) -> Settings | BrowserSettings | None:
    vault = Vault(directory / "foulee")
    if not vault.path.is_file():
        return None
    try:
        saved = vault.open()
        if saved and "browser_signing_key" in saved:
            return BrowserSettings.from_encoded(**saved)
        return Settings(**saved) if saved is not None else None
    except (VaultError, UnsupportedAlgorithm, TypeError, ValueError):
        LOGGER.error("Configuration Foulée illisible. Reconfigurez l’accès sur le PC.")
        return None
    finally:
        vault.close()


def next_session(database: Database, settings: Settings | BrowserSettings, deferred_ids: list[str]) -> tuple[str, dict] | None:
    with database.transaction() as session:
        row = RecordedSession
        revision = func.max(row.closed_at, func.coalesce(row.feeling_updated_at, row.closed_at))
        workout = session.scalar(select(row).where(
            row.profile_id == PROFILE_ID,
            row.mode == "reel",
            row.closed_at >= settings.enabled_at,
            row.checkpoint["phase"].as_string().in_(("completed", "stopped")),
            row.checkpoint["stop_confirmed"].as_boolean().is_(True),
            row.checkpoint["active_s"].as_float() > 0,
            or_(row.foulee_sent_revision.is_(None), row.foulee_sent_revision < revision),
            row.id.not_in(deferred_ids),
        ).order_by(row.closed_at, row.id).limit(1))
        if workout is None:
            return None

        distance = Distance()
        previous = None
        for sample in session.scalars(select(RecordedEntry.data).where(
                RecordedEntry.session_id == workout.id, RecordedEntry.kind == "sample").order_by(RecordedEntry.seq)):
            if previous is not None:
                distance.add(previous, sample)
            previous = sample
        measured = distance.result()
        return max(workout.feeling_updated_at or workout.closed_at, workout.closed_at), {
            "format": "fitnessapp.session.v1",
            "session_id": workout.id,
            "started_at": workout.started_at,
            "title": workout.workout_snapshot["name"],
            "active_seconds": workout.checkpoint["active_s"],
            "distance_m": measured["distance_m"] if measured["distance_quality"] == "complete" else None,
            "perceived_effort": workout.feeling,
        }


def acknowledge(database: Database, session_id: str, revision: str) -> None:
    with database.write() as session:
        row = session.get(RecordedSession, session_id)
        if row and (row.foulee_sent_revision is None or row.foulee_sent_revision < revision):
            row.foulee_sent_revision = revision


class DeliveryError(Exception):
    def __init__(self, message: str, *, affects_all: bool):
        super().__init__(message)
        self.affects_all = affects_all


async def deliver(client: httpx.AsyncClient, settings: Settings, payload: dict) -> None:
    try:
        response = await client.post(ENDPOINT, json=payload, headers={
            "OAI-Sites-Authorization": f"Bearer {settings.token}",
        }, follow_redirects=False)
    except httpx.RequestError:
        raise DeliveryError("Foulée est injoignable", affects_all=True) from None
    if response.status_code not in (200, 201):
        raise DeliveryError(f"Foulée a répondu HTTP {response.status_code}",
                            affects_all=response.status_code not in (400, 409, 422))
    try:
        receipt = response.json()
    except ValueError:
        receipt = None
    if not isinstance(receipt, dict) or receipt.get("ok") is not True or receipt.get("session_id") != payload["session_id"]:
        raise DeliveryError("confirmation Foulée absente ou invalide", affects_all=True)


async def run(database: Database, settings: Settings | BrowserSettings, stopping: asyncio.Event,
              browser: BrowserDelivery | None = None) -> None:
    deferred = {}
    browser_retry = 300
    loop = asyncio.get_running_loop()
    async with httpx.AsyncClient(timeout=8) as client:
        while not stopping.is_set():
            delay = POLL_SECONDS
            deferred = {key: until for key, until in deferred.items() if until > loop.time()}
            try:
                item = await asyncio.to_thread(next_session, database, settings, list(deferred))
                if item and not stopping.is_set():
                    revision, payload = item
                    session_id = payload["session_id"]
                    try:
                        if browser is not None:
                            if not await browser.send(payload, stopping):
                                break
                        elif isinstance(settings, Settings):
                            await deliver(client, settings, payload)
                        else:
                            raise BrowserDeliveryError("navigateur de transfert indisponible")
                        await asyncio.to_thread(acknowledge, database, session_id, revision)
                        browser_retry = 300
                        LOGGER.info("Bilan %s confirmé par Foulée", session_id)
                    except BrowserDeliveryError as exc:
                        LOGGER.warning("Bilan %s en attente d’envoi vers Foulée : %s", session_id, exc)
                        delay = browser_retry
                        browser_retry = min(browser_retry * 2, 3600)
                    except DeliveryError as exc:
                        LOGGER.warning("Bilan %s en attente d’envoi vers Foulée : %s", session_id, exc)
                        if exc.affects_all:
                            delay = 30
                        else:
                            deferred[session_id] = loop.time() + 300
            except SQLAlchemyError:
                LOGGER.exception("File d’attente Foulée temporairement indisponible")
                delay = 30
            try:
                await asyncio.wait_for(stopping.wait(), timeout=delay)
            except TimeoutError:
                pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Régler la synchronisation privée vers Foulée sur ce PC.")
    parser.add_argument("action", choices=("activer", "desactiver"))
    args = parser.parse_args()
    vault = Vault(data_dir(simulation=False) / "foulee")
    try:
        saved = vault.open()
        if args.action == "activer":
            if not sys.stdin.isatty():
                parser.error("Saisissez le jeton depuis un terminal local interactif.")
            with warnings.catch_warnings():
                warnings.simplefilter("error", getpass.GetPassWarning)
                token = getpass.getpass("Jeton de service privé Sites pour Foulée : ").strip()
            settings = Settings(token, saved["enabled_at"] if saved else utc_now())
            vault.save({"token": settings.token, "enabled_at": settings.enabled_at})
        else:
            vault.path.unlink(missing_ok=True)
    except (VaultError, OSError, ValueError, TypeError, KeyError, getpass.GetPassWarning):
        parser.error("Impossible d’enregistrer la configuration Foulée sur ce PC.")
    finally:
        vault.close()
    print("Redémarrez le serveur FitnessApp pour appliquer le réglage Foulée.")


if __name__ == "__main__":
    main()
