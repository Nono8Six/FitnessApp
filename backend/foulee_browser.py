"""Transfert par la session navigateur, avec un reçu sur la boucle locale."""
import asyncio
import base64
import hmac
import json
import os
import re
import time
import webbrowser
from dataclasses import dataclass, field
from datetime import datetime
from uuid import uuid4

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ed25519, padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import load_der_private_key, load_der_public_key

TRANSFER_URL = "https://foulee-objectif-arnaud.nono8six.chatgpt.site/fitnessapp/synchroniser"
RECEIPT_PATH = "/foulee/retour"
RECEIPT_TIMEOUT = 240


@dataclass(frozen=True)
class BrowserSettings:
    enabled_at: str
    signer: ed25519.Ed25519PrivateKey = field(repr=False)
    receiver: rsa.RSAPublicKey

    @classmethod
    def from_encoded(cls, *, enabled_at: str, browser_signing_key: str, browser_receiver_key: str):
        if datetime.fromisoformat(enabled_at).tzinfo is None:
            raise ValueError("Date d’activation Foulée invalide.")
        signer = load_der_private_key(base64.b64decode(browser_signing_key, validate=True), None)
        receiver = load_der_public_key(base64.b64decode(browser_receiver_key, validate=True))
        if not isinstance(signer, ed25519.Ed25519PrivateKey) or not isinstance(receiver, rsa.RSAPublicKey) or receiver.key_size != 3072:
            raise ValueError("Clés de transfert Foulée invalides.")
        return cls(enabled_at, signer, receiver)


def capsule(settings: BrowserSettings, payload: dict, receipt: str) -> str:
    def encode(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

    data = json.dumps({"expires_at": int(time.time()) + 300, "receipt": receipt, "session": payload},
                      ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    key, iv = AESGCM.generate_key(bit_length=256), os.urandom(12)
    wrapped = settings.receiver.encrypt(key, padding.OAEP(
        mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    ciphertext = AESGCM(key).encrypt(iv, data, None)
    signed = ".".join(("v1", encode(wrapped), encode(iv), encode(ciphertext)))
    return signed + "." + encode(settings.signer.sign(signed.encode("ascii")))


class BrowserDeliveryError(Exception):
    pass


class BrowserDelivery:
    def __init__(self, settings: BrowserSettings):
        self.settings = settings
        self.pending: tuple[str, asyncio.Event] | None = None

    def confirm(self, receipt: str) -> bool:
        if self.pending and re.fullmatch(r"[0-9a-f]{32}", receipt) and hmac.compare_digest(self.pending[0], receipt):
            self.pending[1].set()
            return True
        return False

    async def send(self, payload: dict, stopping: asyncio.Event) -> bool:
        receipt, received = uuid4().hex, asyncio.Event()
        url = TRANSFER_URL + "#" + capsule(self.settings, payload, receipt)
        self.pending = receipt, received
        waiters = (asyncio.create_task(received.wait()), asyncio.create_task(stopping.wait()))
        try:
            try:
                opened = await asyncio.to_thread(webbrowser.open, url, new=2)
            except (OSError, webbrowser.Error):
                opened = False
            if not opened:
                raise BrowserDeliveryError("impossible d’ouvrir Foulée dans le navigateur du PC")
            await asyncio.wait(waiters, timeout=RECEIPT_TIMEOUT, return_when=asyncio.FIRST_COMPLETED)
            if not received.is_set() and not stopping.is_set():
                raise BrowserDeliveryError("reçu absent. Vérifiez que Foulée est connectée dans le navigateur du PC")
            return received.is_set()
        finally:
            self.pending = None
            for waiter in waiters:
                waiter.cancel()
            await asyncio.gather(*waiters, return_exceptions=True)
