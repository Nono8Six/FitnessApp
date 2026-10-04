"""Read-only observation of live POC telemetry; never sends a command."""

import argparse
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("label")
    parser.add_argument("--speed", type=float)
    parser.add_argument("--incline", type=float)
    parser.add_argument("--phase", default="connected")
    parser.add_argument("--workout")
    parser.add_argument("--disarmed", action="store_true")
    parser.add_argument("--timeout", type=float, default=20)
    parser.add_argument("--hold", type=float, default=2)
    args = parser.parse_args()
    samples = []
    began = time.monotonic()
    matching_since = None
    success = False
    error = None
    while time.monotonic() - began <= args.timeout:
        request = urllib.request.Request(
            "http://127.0.0.1:4317/api/state",
            headers={"X-Poc-Client": "reception-observation-20261004"},
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                state = json.load(response)
        except Exception as exc:
            error = str(exc)
            break
        samples.append({"utc": datetime.now(timezone.utc).isoformat(),
                        "elapsed_s": round(time.monotonic() - began, 2), "state": state})
        matches = state["phase"] == args.phase and not state["audit_error"]
        if args.workout:
            matches = matches and state["workout"]["phase"] == args.workout
        if args.disarmed:
            matches = matches and not state["armed"]
        for field, target, tolerance in (("speed_kmh", args.speed, 0.05),
                                          ("incline_pct", args.incline, 0.1)):
            if target is not None:
                actual = state["telemetry"].get(field)
                matches = matches and actual is not None and abs(actual - target) <= tolerance
                matches = matches and state["ages"].get(field, 999) <= 1
        if matches:
            if matching_since is None:
                matching_since = time.monotonic()
            if time.monotonic() - matching_since >= args.hold:
                success = True
                break
        else:
            matching_since = None
        time.sleep(0.25)
    result = {"label": args.label, "success": success, "error": error,
              "expected": {"speed_kmh": args.speed, "incline_pct": args.incline,
                           "phase": args.phase, "workout": args.workout, "disarmed": args.disarmed},
              "stable_for_s": args.hold, "samples": samples}
    destination = Path("docs/preuves") / f"reception-{args.label}.json"
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    last = samples[-1]["state"] if samples else {}
    print(json.dumps({"label": args.label, "success": success,
                      "elapsed_s": round(time.monotonic() - began, 2),
                      "phase": last.get("phase"), "telemetry": last.get("telemetry"),
                      "armed": last.get("armed"), "workout": last.get("workout"),
                      "error": error}, ensure_ascii=False))
    raise SystemExit(0 if success else 1)


if __name__ == "__main__":
    main()
