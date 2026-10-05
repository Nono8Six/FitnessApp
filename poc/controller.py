"""Compatibilité du POC : une seule implémentation du contrôleur FTMS."""

import sys

from backend.device import controller

sys.modules[__name__] = controller
