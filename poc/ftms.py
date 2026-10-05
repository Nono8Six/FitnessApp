"""Compatibilité du POC : protocole partagé avec l'application."""

import sys

from backend.device import ftms

sys.modules[__name__] = ftms
