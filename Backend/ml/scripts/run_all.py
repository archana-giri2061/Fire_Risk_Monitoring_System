# run_all.py
# Convenience script that runs the full ML pipeline in sequence:
#   1. train_model.py       — trains the fire risk classifier on historical data
#   2. test_with_archive.py — evaluates the trained model against archive data
#   3. predict_forecast.py  — generates the 7-day forecast and stores predictions
#
# Stops immediately if any step exits with a non-zero return code so that
# a failed training run does not proceed to prediction with a broken model.
#
# Usage (run from Backend/):
#     python ml/scripts/run_all.py

import subprocess
import sys
from pathlib import Path

# Resolve the directory this script lives in so sibling scripts can be
# referenced by name regardless of what directory the command is run from
SCRIPTS_DIR = Path(__file__).resolve().parent


def run(script_name: str):
    """
    Runs a single ML script as a subprocess using the same Python interpreter
    that is running this script. This ensures the correct virtual environment
    and installed packages are used regardless of what is on the system PATH.

    Prints a header line before each script so the output from each step is
    clearly separated in the terminal or server logs.

    Parameters:
        script_name: Filename of the script to run, e.g. "train_model.py"

    Raises:
        SystemExit if the script exits with a non-zero return code,
        stopping the pipeline before the next step runs.
    """
    print(f"\n{'=' * 20} {script_name} {'=' * 20}")

    p = subprocess.run(
        [sys.executable, str(SCRIPTS_DIR / script_name)],
        check=False,  # Do not raise automatically — we check returncode manually below
    )

    if p.returncode != 0:
        # Raise SystemExit so the error message is printed cleanly without a traceback
        raise SystemExit(f"Failed at step: {script_name} (exit code {p.returncode})")


def main():
    """
    Runs all three pipeline steps in order.
    Each step must succeed before the next one starts.
    """
    run("train_model.py")
    run("test_with_archive.py")
    run("predict_forecast.py")
    print("\nAll steps completed successfully.")


if __name__ == "__main__":
    main()