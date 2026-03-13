import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent

def run(script_name: str):
    print(f"\n==================== {script_name} ====================")
    p = subprocess.run([sys.executable, str(SCRIPTS_DIR / script_name)], check=False)
    if p.returncode != 0:
        raise SystemExit(f"❌ Failed: {script_name}")

def main():
    run("train_model.py")
    run("test_with_archive.py")
    run("predict_forecast.py")
    print("\n✅ All steps completed.")

if __name__ == "__main__":
    main()