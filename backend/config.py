import os
import sys
from pathlib import Path


def data_root() -> Path:
    """Dossier des données utilisateur, hors du dépôt et du build."""
    override = os.environ.get("FITNESS_DATA_DIR")
    if override:
        return Path(override)
    if sys.platform == "win32" and os.environ.get("LOCALAPPDATA"):
        return Path(os.environ["LOCALAPPDATA"]) / "FitnessApp"
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "FitnessApp"


def data_dir(*, simulation: bool, root: Path | None = None) -> Path:
    """Les données réelles et simulées ne partagent jamais le même dossier."""
    path = (root or data_root()) / ("simulation" if simulation else "reel")
    path.mkdir(parents=True, exist_ok=True)
    return path
