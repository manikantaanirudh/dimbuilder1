import pathlib
import sys

# Put the scripts/ directory on sys.path so `import refcatalog...` works in tests.
SCRIPTS_DIR = pathlib.Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))
