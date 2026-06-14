"""CLI: read metadata/REF_CATALOG.schema.json and write the neutral catalog
XML plus the flat schema CSV. Self-validates before writing the XML."""
import csv
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from refcatalog.generate import (  # noqa: E402
    CSV_FIELDS,
    build_catalog,
    schema_to_rows,
    system_dim_rows,
    validate_catalog,
)
from refcatalog.system_dims import SYSTEM_DIMS  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main():
    schema = json.loads(
        (ROOT / "metadata" / "REF_CATALOG.schema.json").read_text(encoding="utf-8")
    )
    xml = build_catalog(schema, SYSTEM_DIMS)
    validate_catalog(xml, schema)  # aborts (raises) before any file is written

    (ROOT / "metadata" / "REF_CATALOG.xml").write_text(xml, encoding="utf-8")

    rows = schema_to_rows(schema) + system_dim_rows(SYSTEM_DIMS)
    with open(
        ROOT / "metadata" / "REF_CATALOG.schema.csv",
        "w",
        newline="",
        encoding="utf-8",
    ) as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"wrote REF_CATALOG.xml and REF_CATALOG.schema.csv ({len(rows)} rows)")


if __name__ == "__main__":
    main()
