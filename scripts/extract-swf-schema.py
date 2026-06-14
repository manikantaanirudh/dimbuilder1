"""CLI: read metadata/SWF.xml and write metadata/REF_CATALOG.schema.json."""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from refcatalog.extract import extract_schema  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main():
    xml = (ROOT / "metadata" / "SWF.xml").read_text(encoding="utf-8")
    schema = extract_schema(xml)
    out = ROOT / "metadata" / "REF_CATALOG.schema.json"
    out.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
    total = sum(len(v["properties"]) for v in schema.values())
    print(f"wrote {out} ({len(schema)} dim types, {total} properties)")


if __name__ == "__main__":
    main()
