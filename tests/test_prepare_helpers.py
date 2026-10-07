"""Une même source doit éviter les reconstructions entre les deux PowerShell."""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


HELPERS = Path(__file__).resolve().parents[1] / "scripts" / "prepare-helpers.ps1"


@unittest.skipUnless(sys.platform == "win32" and shutil.which("pwsh.exe")
                     and shutil.which("powershell.exe"), "Les deux PowerShell Windows sont requis")
class PreparationFingerprintTests(unittest.TestCase):
    def fingerprint(self, shell, directory):
        def quote(path):
            return "'" + str(path).replace("'", "''") + "'"

        result = subprocess.run(
            [shell, "-NoProfile", "-NonInteractive", "-Command",
             f"$ErrorActionPreference = 'Stop'; . {quote(HELPERS)}; Get-SourceFingerprint {quote(directory)} @('package.json', 'package-lock.json')"],
            # Comme Lancer Fitness.cmd : chaque PowerShell recharge ses propres modules.
            env={key: value for key, value in os.environ.items() if key.upper() != "PSMODULEPATH"},
            check=True, capture_output=True, text=True,
        )
        value = result.stdout.strip()
        self.assertRegex(value, r"^[A-F0-9]{64}$")
        return value

    def test_fingerprint_is_stable_across_shells_and_changes_with_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            manifest = directory / "package.json"
            manifest.write_text("manifest", encoding="utf-8")
            (directory / "package-lock.json").write_text("lock", encoding="utf-8")
            before = self.fingerprint("pwsh.exe", directory)
            self.assertEqual(self.fingerprint("powershell.exe", directory), before)
            manifest.write_text("manifest modifié", encoding="utf-8")
            after = self.fingerprint("pwsh.exe", directory)
            self.assertNotEqual(after, before)
            self.assertEqual(self.fingerprint("powershell.exe", directory), after)


if __name__ == "__main__":
    unittest.main()
