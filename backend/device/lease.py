"""Verrou local partagé par l'application et le POC, libéré par l'OS à l'arrêt."""

import os
import tempfile
from pathlib import Path


class BluetoothLease:
    def __init__(self):
        self.file = None

    def acquire(self):
        if self.file is not None:
            raise OSError("Ce contrôleur possède déjà une connexion Bluetooth")
        handle = (Path(tempfile.gettempdir()) / "fitnessapp-ftms.lock").open("a+b")
        try:
            if handle.tell() == 0:
                handle.write(b"0")
                handle.flush()
            handle.seek(0)
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException:
            handle.close()
            raise
        self.file = handle

    def release(self):
        if self.file is not None:
            self.file.close()
            self.file = None
