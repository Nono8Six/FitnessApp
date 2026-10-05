"""Coffre indépendant des profils et exports : DPAPI utilisateur, ACL et remplacement atomique."""
import ctypes
import json
import os
import sys
import tempfile
from pathlib import Path


class VaultError(Exception):
    pass


def protect_bytes(value: bytes, *, decrypt: bool = False) -> bytes:
    if sys.platform != "win32":
        raise VaultError("La connexion ChatGPT nécessite le PC Windows.")
    from ctypes import wintypes

    class Blob(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_ubyte))]

    buffer = ctypes.create_string_buffer(value)
    source = Blob(len(value), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    target = Blob()
    crypt = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    method = crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    method.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p,
                       ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    method.restype = wintypes.BOOL
    # CRYPTPROTECT_UI_FORBIDDEN ; jamais CRYPTPROTECT_LOCAL_MACHINE.
    if not method(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target)):
        raise VaultError("Le coffre ChatGPT ne peut pas être ouvert avec ce compte Windows.")
    try:
        return ctypes.string_at(target.data, target.size)
    finally:
        kernel.LocalFree(target.data)


def owner_only(path: Path) -> None:
    from ctypes import wintypes
    api = ctypes.WinDLL("advapi32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    api.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes = [
        wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p]
    api.ConvertStringSecurityDescriptorToSecurityDescriptorW.restype = wintypes.BOOL
    api.SetFileSecurityW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_void_p]
    api.SetFileSecurityW.restype = wintypes.BOOL
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    descriptor = ctypes.c_void_p()
    # OWNER RIGHTS : seul le propriétaire, héritage des droits sur les enfants.
    if not api.ConvertStringSecurityDescriptorToSecurityDescriptorW(
            "D:P(A;OICI;FA;;;OW)", 1, ctypes.byref(descriptor), None):
        raise VaultError("Protection du coffre ChatGPT impossible.")
    try:
        if not api.SetFileSecurityW(str(path), 0x80000004, descriptor):
            raise VaultError("Protection du coffre ChatGPT impossible.")
    finally:
        kernel.LocalFree(descriptor)


class Vault:
    def __init__(self, directory: Path):
        self.directory = directory
        self.path = directory / "connection.dpapi"
        self._lock = None

    def open(self) -> dict | None:
        if sys.platform != "win32":
            raise VaultError("La connexion ChatGPT nécessite le PC Windows.")
        import msvcrt
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            owner_only(self.directory)
            self._lock = (self.directory / "connection.lock").open("a+b")
            self._lock.seek(0)
            if not self._lock.read(1):
                self._lock.write(b"0")
                self._lock.flush()
            self._lock.seek(0)
            msvcrt.locking(self._lock.fileno(), msvcrt.LK_NBLCK, 1)
        except (OSError, VaultError):
            self.close()
            raise VaultError("Connexion ChatGPT indisponible : coffre inaccessible ou déjà ouvert par une autre instance.") from None
        try:
            return json.loads(protect_bytes(self.path.read_bytes(), decrypt=True)) if self.path.exists() else None
        except (OSError, ValueError, VaultError):
            self.close()
            raise VaultError("Le coffre ChatGPT est illisible. Les données existantes ont été conservées.") from None

    def save(self, value: dict) -> None:
        if self._lock is None:
            raise VaultError("Le coffre ChatGPT n’est pas ouvert.")
        temporary = None
        try:
            encrypted = protect_bytes(json.dumps(value, ensure_ascii=False).encode("utf-8"))
            with tempfile.NamedTemporaryFile(dir=self.directory, prefix="connection-", suffix=".tmp", delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(encrypted)
                stream.flush()
                os.fsync(stream.fileno())
            owner_only(temporary)
            os.replace(temporary, self.path)
        except (OSError, VaultError):
            raise VaultError("Enregistrement sécurisé de la connexion ChatGPT impossible.") from None
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    def close(self) -> None:
        if self._lock is not None:
            self._lock.close()
            self._lock = None
