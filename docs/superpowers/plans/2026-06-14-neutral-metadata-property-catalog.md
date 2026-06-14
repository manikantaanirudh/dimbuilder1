# Neutral OneStream Metadata Property Catalog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a neutral, SWF-free OneStream XF metadata catalog (`REF_CATALOG.xml`) plus a flat property-schema table (`REF_CATALOG.schema.csv`) from a single extracted source of truth (`REF_CATALOG.schema.json`), so every dimension type and property can seed master metadata tables.

**Architecture:** Two phases. An extractor reads `metadata/SWF.xml`, infers each property's datatype and valid-value domain from real data, and writes `REF_CATALOG.schema.json`. A generator reads that JSON and emits a neutral-named importable XML and a CSV of schema rows, self-validating that every property is present. Logic lives in an importable `scripts/refcatalog/` package; thin CLI wrappers drive each phase.

**Tech Stack:** Python 3.14 (standard library only — `re`, `json`, `csv`, `collections`, `xml.dom.minidom`), pytest 9 for tests.

---

## File Structure

- `scripts/refcatalog/__init__.py` — package marker
- `scripts/refcatalog/extract.py` — XML parsing, datatype inference, schema extraction
- `scripts/refcatalog/generate.py` — XML/CSV builders + validation
- `scripts/refcatalog/system_dims.py` — `SYSTEM_DIMS` constant (Consolidation/View/Time)
- `scripts/extract-swf-schema.py` — CLI: SWF.xml → REF_CATALOG.schema.json
- `scripts/gen-ref-catalog.py` — CLI: schema.json → REF_CATALOG.xml + .csv
- `tests/refcatalog/conftest.py` — puts `scripts/` on `sys.path`
- `tests/refcatalog/test_extract.py` — extractor tests
- `tests/refcatalog/test_generate.py` — generator tests
- Generated/committed: `metadata/REF_CATALOG.schema.json`, `metadata/REF_CATALOG.xml`, `metadata/REF_CATALOG.schema.csv`

All test commands run from repo root `C:\Naga\projects\dimbuilder`.

---

### Task 1: Package scaffold + datatype inference

**Files:**
- Create: `scripts/refcatalog/__init__.py`
- Create: `scripts/refcatalog/extract.py`
- Create: `tests/refcatalog/conftest.py`
- Test: `tests/refcatalog/test_extract.py`

- [ ] **Step 1: Create the package marker and test path setup**

Create `scripts/refcatalog/__init__.py` (empty file):

```python
```

Create `tests/refcatalog/conftest.py`:

```python
import pathlib
import sys

# Put the scripts/ directory on sys.path so `import refcatalog...` works in tests.
SCRIPTS_DIR = pathlib.Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))
```

- [ ] **Step 2: Write the failing test for datatype inference**

Create `tests/refcatalog/test_extract.py`:

```python
from collections import Counter

from refcatalog.extract import infer_datatype, pick_representative


def test_infer_bool():
    assert infer_datatype(["true", "false"]) == "bool"
    assert infer_datatype(["false"]) == "bool"


def test_infer_int():
    assert infer_datatype(["0", "12", "-3"]) == "int"


def test_infer_enum():
    assert infer_datatype(["Revenue", "Expense", "Asset"]) == "enum"


def test_infer_text_when_freeform():
    assert infer_datatype(["Total Revenue", "Some long description here"]) == "text"


def test_infer_text_when_empty():
    assert infer_datatype([]) == "text"


def test_pick_representative_skips_empty():
    c = Counter({"": 50, "Revenue": 3, "Expense": 1})
    assert pick_representative(c) == "Revenue"


def test_pick_representative_all_empty():
    assert pick_representative(Counter({"": 5})) == ""
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest tests/refcatalog/test_extract.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'refcatalog.extract'` (or import error).

- [ ] **Step 4: Implement inference helpers**

Create `scripts/refcatalog/extract.py`:

```python
import re
from collections import Counter, OrderedDict

_INT_RE = re.compile(r"-?\d+")
_TOKEN_RE = re.compile(r"[A-Za-z0-9_.]+")


def infer_datatype(values):
    """Infer a datatype from a list of non-empty string values."""
    vals = [v for v in values if v != ""]
    if not vals:
        return "text"
    distinct = set(vals)
    if {v.lower() for v in distinct} <= {"true", "false"}:
        return "bool"
    if all(_INT_RE.fullmatch(v) for v in distinct):
        return "int"
    if len(distinct) <= 15 and all(_TOKEN_RE.fullmatch(v) for v in distinct):
        return "enum"
    return "text"


def pick_representative(counter):
    """Return the most common non-empty value, or '' if always empty."""
    for value, _count in counter.most_common():
        if value != "":
            return value
    return ""
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/refcatalog/test_extract.py -v`
Expected: PASS (7 passed).

- [ ] **Step 6: Commit**

```bash
git add scripts/refcatalog/__init__.py scripts/refcatalog/extract.py tests/refcatalog/conftest.py tests/refcatalog/test_extract.py
git commit -m "feat(refcatalog): add datatype inference helpers"
```

---

### Task 2: Schema extraction from XML

**Files:**
- Modify: `scripts/refcatalog/extract.py` (add parsing + `extract_schema`)
- Test: `tests/refcatalog/test_extract.py` (add cases)

- [ ] **Step 1: Write the failing test for `extract_schema`**

Append to `tests/refcatalog/test_extract.py`:

```python
from refcatalog.extract import extract_schema

SAMPLE_XML = """<?xml version="1.0" encoding="utf-8"?>
<OneStreamXF version="9.2.0.18004">
  <metadataRoot>
    <dimensions>
      <dimension type="Account" name="SummaryAcct" accessGroup="Everyone">
        <members>
          <member name="A1" alias="" description="d1" displayMemberGroup="Everyone">
            <properties>
              <property name="AccountType" value="Revenue" />
              <property name="IsIC" value="false" />
              <property name="Formula" value="" />
            </properties>
          </member>
          <member name="A2" alias="" description="d2" displayMemberGroup="Everyone">
            <properties>
              <property name="AccountType" value="Expense" />
              <property name="IsIC" value="true" />
              <property name="Formula" value="" />
            </properties>
          </member>
        </members>
        <relationships>
          <relationship parent="root" child="A1" />
        </relationships>
      </dimension>
      <dimension type="Scenario" name="Scenarios" accessGroup="Everyone">
        <members>
          <member name="S1" alias="" description="d" readDataGroup="Everyone">
            <properties>
              <property name="InputFrequency" time="" value="Monthly" />
            </properties>
          </member>
        </members>
      </dimension>
    </dimensions>
  </metadataRoot>
</OneStreamXF>
"""


def test_extract_schema_dim_types():
    schema = extract_schema(SAMPLE_XML)
    assert set(schema.keys()) == {"Account", "Scenario"}


def test_extract_schema_property_order_and_datatype():
    schema = extract_schema(SAMPLE_XML)
    props = {p["name"]: p for p in schema["Account"]["properties"]}
    assert [p["name"] for p in schema["Account"]["properties"]] == [
        "AccountType",
        "IsIC",
        "Formula",
    ]
    assert props["AccountType"]["datatype"] == "enum"
    assert sorted(props["AccountType"]["valid"]) == ["Expense", "Revenue"]
    assert props["IsIC"]["datatype"] == "bool"
    assert props["Formula"]["datatype"] == "text"
    assert "valid" not in props["Formula"]


def test_extract_schema_member_attrs_exclude_name():
    schema = extract_schema(SAMPLE_XML)
    assert "name" not in schema["Account"]["memberAttrs"]
    assert "displayMemberGroup" in schema["Account"]["memberAttrs"]


def test_extract_schema_handles_time_attr_before_value():
    schema = extract_schema(SAMPLE_XML)
    props = {p["name"]: p for p in schema["Scenario"]["properties"]}
    assert props["InputFrequency"]["value"] == "Monthly"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/refcatalog/test_extract.py -k extract_schema -v`
Expected: FAIL — `ImportError: cannot import name 'extract_schema'`.

- [ ] **Step 3: Implement parsing + `extract_schema`**

Append to `scripts/refcatalog/extract.py`:

```python
_DIM_RE = re.compile(r'<dimension type="([^"]+)"[^>]*>')
_MEMBER_RE = re.compile(r"<member\b.*?</member>", re.DOTALL)
_MEMBER_OPEN_RE = re.compile(r"<member\s+([^>]*?)/?>")
_PROP_RE = re.compile(r"<property\s+([^>]*?)/?>")
_ATTR_RE = re.compile(r'(\w+)="([^"]*)"')


def _parse_attrs(attr_text):
    return dict(_ATTR_RE.findall(attr_text))


def extract_schema(xml):
    """Derive an ordered per-dim-type property schema from OneStream XML text."""
    dims = list(_DIM_RE.finditer(xml))
    acc = OrderedDict()  # dtype -> {order: [], values: {name: Counter}, attrs: []}
    for i, dim in enumerate(dims):
        dtype = dim.group(1)
        start = dim.end()
        end = dims[i + 1].start() if i + 1 < len(dims) else len(xml)
        block = xml[start:end]
        bucket = acc.setdefault(dtype, {"order": [], "values": {}, "attrs": []})
        for mem in _MEMBER_RE.finditer(block):
            text = mem.group(0)
            open_tag = _MEMBER_OPEN_RE.search(text)
            if open_tag:
                for name, _val in _ATTR_RE.findall(open_tag.group(1)):
                    if name != "name" and name not in bucket["attrs"]:
                        bucket["attrs"].append(name)
            for prop in _PROP_RE.finditer(text):
                attrs = _parse_attrs(prop.group(1))
                name = attrs.get("name")
                if not name:
                    continue
                value = attrs.get("value", "")
                if name not in bucket["values"]:
                    bucket["order"].append(name)
                    bucket["values"][name] = Counter()
                bucket["values"][name][value] += 1

    schema = OrderedDict()
    for dtype, bucket in acc.items():
        properties = []
        for name in bucket["order"]:
            counter = bucket["values"][name]
            distinct = [v for v in counter if v != ""]
            datatype = infer_datatype(distinct)
            entry = {
                "name": name,
                "datatype": datatype,
                "value": pick_representative(counter),
            }
            if datatype in ("bool", "enum"):
                entry["valid"] = sorted(set(distinct))
            properties.append(entry)
        schema[dtype] = {"memberAttrs": bucket["attrs"], "properties": properties}
    return schema
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/refcatalog/test_extract.py -v`
Expected: PASS (all extract tests green).

- [ ] **Step 5: Commit**

```bash
git add scripts/refcatalog/extract.py tests/refcatalog/test_extract.py
git commit -m "feat(refcatalog): extract per-dim-type schema from XML"
```

---

### Task 3: Generate the source-of-truth schema.json from SWF

**Files:**
- Create: `scripts/extract-swf-schema.py`
- Create (output, committed): `metadata/REF_CATALOG.schema.json`

- [ ] **Step 1: Write the CLI wrapper**

Create `scripts/extract-swf-schema.py`:

```python
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
```

- [ ] **Step 2: Run the extractor**

Run: `python scripts/extract-swf-schema.py`
Expected: prints `wrote ...REF_CATALOG.schema.json (12 dim types, ~289 properties)` (counts may vary slightly; non-zero).

- [ ] **Step 3: Sanity-check the output**

Run: `python -c "import json; s=json.load(open('metadata/REF_CATALOG.schema.json')); print(sorted(s)); print({k:len(v['properties']) for k,v in s.items()})"`
Expected: dim types include `Account, Entity, Flow, Scenario, UD1..UD8`; Account ≈ 42, Entity ≈ 29, Flow ≈ 12, Scenario ≈ 32, UD1 ≈ 34, UD2..UD8 ≈ 20 each.

- [ ] **Step 4: Commit**

```bash
git add scripts/extract-swf-schema.py metadata/REF_CATALOG.schema.json
git commit -m "feat(refcatalog): generate schema.json source of truth from SWF"
```

---

### Task 4: XML builders (members, dimensions, catalog)

**Files:**
- Create: `scripts/refcatalog/system_dims.py`
- Create: `scripts/refcatalog/generate.py`
- Test: `tests/refcatalog/test_generate.py`

- [ ] **Step 1: Create the system-dimension constant**

Create `scripts/refcatalog/system_dims.py`:

```python
"""OneStream system dimensions not present in SWF.xml.

These are system-managed: standard fixed members, no rich property schema.
"""
SYSTEM_DIMS = {
    "Consolidation": {
        "dimName": "REF_Consolidation",
        "memberAttrs": ["alias", "description"],
        "members": ["Local", "Translated", "Contribution"],
    },
    "View": {
        "dimName": "REF_View",
        "memberAttrs": ["alias", "description"],
        "members": ["Periodic", "YTD", "QTD"],
    },
    "Time": {
        "dimName": "REF_Time",
        "memberAttrs": ["alias", "description"],
        "members": ["2024", "2024M1"],
    },
}
```

- [ ] **Step 2: Write failing tests for the XML builders**

Create `tests/refcatalog/test_generate.py`:

```python
import xml.dom.minidom as minidom

from refcatalog.generate import (
    build_catalog,
    build_dimension,
    build_member,
)
from refcatalog.system_dims import SYSTEM_DIMS

SCHEMA = {
    "Account": {
        "memberAttrs": ["alias", "description", "displayMemberGroup"],
        "properties": [
            {"name": "AccountType", "datatype": "enum", "value": "Revenue",
             "valid": ["Expense", "Revenue"]},
            {"name": "IsIC", "datatype": "bool", "value": "false",
             "valid": ["false", "true"]},
            {"name": "Formula", "datatype": "text", "value": ""},
        ],
    },
    "Entity": {
        "memberAttrs": ["alias", "description", "readDataGroup", "readDataGroup2"],
        "properties": [
            {"name": "Currency", "datatype": "enum", "value": "USD",
             "valid": ["EUR", "USD"]},
        ],
    },
}


def test_build_member_includes_all_properties():
    frag = build_member("ACC_TOTAL", ["alias", "description"],
                        SCHEMA["Account"]["properties"])
    assert 'name="ACC_TOTAL"' in frag
    assert 'name="AccountType" value="Revenue"' in frag
    assert 'name="IsIC" value="false"' in frag
    assert 'name="Formula" value=""' in frag


def test_build_member_group_attr_defaults():
    frag = build_member("ENT_1", ["readDataGroup", "readDataGroup2"], [])
    assert 'readDataGroup="Everyone"' in frag
    assert 'readDataGroup2="Nobody"' in frag


def test_build_dimension_has_two_members_and_relationships():
    frag = build_dimension("Account", "REF_Account",
                          SCHEMA["Account"]["memberAttrs"],
                          SCHEMA["Account"]["properties"])
    assert 'type="Account"' in frag
    assert 'name="REF_Account"' in frag
    assert 'inheritedDim="RootAccountDim"' in frag
    assert frag.count("<member ") == 2
    assert 'parent="root" child="ACC_TOTAL"' in frag
    assert 'parent="ACC_TOTAL" child="ACC_001"' in frag


def test_build_dimension_entity_has_empty_inherited():
    frag = build_dimension("Entity", "REF_Entity",
                          SCHEMA["Entity"]["memberAttrs"],
                          SCHEMA["Entity"]["properties"])
    assert 'inheritedDim=""' in frag


def test_build_catalog_is_well_formed_and_has_system_dims():
    xml = build_catalog(SCHEMA, SYSTEM_DIMS)
    doc = minidom.parseString(xml)  # raises if malformed
    types = [d.getAttribute("type") for d in doc.getElementsByTagName("dimension")]
    assert "Account" in types
    assert "Consolidation" in types
    assert "Time" in types
    assert doc.documentElement.getAttribute("version") == "9.2.0.18004"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest tests/refcatalog/test_generate.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'refcatalog.generate'`.

- [ ] **Step 4: Implement the XML builders**

Create `scripts/refcatalog/generate.py`:

```python
NAME_PREFIX = {
    "Account": "ACC",
    "Entity": "ENT",
    "Flow": "FLW",
    "Scenario": "SC",
    "UD1": "UD1", "UD2": "UD2", "UD3": "UD3", "UD4": "UD4",
    "UD5": "UD5", "UD6": "UD6", "UD7": "UD7", "UD8": "UD8",
}


def esc(text):
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _attr_value(attr, member_name):
    if attr == "description":
        return member_name
    if attr == "alias":
        return ""
    if attr.endswith("Group2"):
        return "Nobody"
    if attr.endswith("Group"):
        return "Everyone"
    return ""


def build_member(name, member_attrs, properties):
    attr_str = f'name="{esc(name)}"'
    for attr in member_attrs:
        attr_str += f' {attr}="{esc(_attr_value(attr, name))}"'
    lines = [f"                    <member {attr_str}>"]
    lines.append("                        <properties>")
    for prop in properties:
        value = esc(prop.get("value", ""))
        lines.append(
            f'                            <property name="{esc(prop["name"])}" value="{value}" />'
        )
    lines.append("                        </properties>")
    lines.append("                    </member>")
    return "\n".join(lines)


def _dimension_header(dtype, dim_name, inherited):
    return (
        f'            <dimension type="{dtype}" name="{esc(dim_name)}" '
        f'accessGroup="Everyone" maintenanceGroup="Everyone" description="" '
        f'inheritedDim="{inherited}" dimMemberSourceType="Standard" '
        f'dimMemberSourcePath="" dimMemberSourceNVPairs="">'
    )


def build_dimension(dtype, dim_name, member_attrs, properties):
    inherited = "" if dtype == "Entity" else f"Root{dtype}Dim"
    prefix = NAME_PREFIX.get(dtype, dtype)
    parent = f"{prefix}_TOTAL"
    child = f"{prefix}_001"
    lines = [_dimension_header(dtype, dim_name, inherited), "                <members>"]
    lines.append(build_member(parent, member_attrs, properties))
    lines.append(build_member(child, member_attrs, properties))
    lines.append("                </members>")
    lines.append("                <relationships>")
    lines.append(f'                    <relationship parent="root" child="{esc(parent)}" />')
    lines.append(f'                    <relationship parent="{esc(parent)}" child="{esc(child)}" />')
    lines.append("                </relationships>")
    lines.append("            </dimension>")
    return "\n".join(lines)


def build_system_dimension(dtype, cfg):
    lines = [
        _dimension_header(dtype, cfg["dimName"], ""),
        "                <members>",
    ]
    for member_name in cfg["members"]:
        lines.append(build_member(member_name, cfg["memberAttrs"], []))
    lines.append("                </members>")
    lines.append("                <relationships>")
    for member_name in cfg["members"]:
        lines.append(
            f'                    <relationship parent="root" child="{esc(member_name)}" />'
        )
    lines.append("                </relationships>")
    lines.append("            </dimension>")
    return "\n".join(lines)


def build_catalog(schema, system_dims):
    parts = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<OneStreamXF version="9.2.0.18004">',
        "    <metadataRoot>",
        "        <dimensions>",
    ]
    for dtype, entry in schema.items():
        dim_name = f"REF_{dtype}"
        parts.append(
            build_dimension(dtype, dim_name, entry["memberAttrs"], entry["properties"])
        )
    for dtype, cfg in system_dims.items():
        parts.append(build_system_dimension(dtype, cfg))
    parts.append("        </dimensions>")
    parts.append("    </metadataRoot>")
    parts.append("</OneStreamXF>")
    return "\n".join(parts) + "\n"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/refcatalog/test_generate.py -v`
Expected: PASS (5 passed).

- [ ] **Step 6: Commit**

```bash
git add scripts/refcatalog/system_dims.py scripts/refcatalog/generate.py tests/refcatalog/test_generate.py
git commit -m "feat(refcatalog): add XML catalog builders"
```

---

### Task 5: CSV rows + validation

**Files:**
- Modify: `scripts/refcatalog/generate.py` (add `schema_to_rows`, `system_dim_rows`, `validate_catalog`)
- Test: `tests/refcatalog/test_generate.py` (add cases)

- [ ] **Step 1: Write failing tests for rows + validation**

Append to `tests/refcatalog/test_generate.py`:

```python
import pytest

from refcatalog.generate import (
    schema_to_rows,
    system_dim_rows,
    validate_catalog,
)


def test_schema_to_rows_property_and_attr_rows():
    rows = schema_to_rows(SCHEMA)
    acct_attr = [r for r in rows if r["dim_type"] == "Account"
                 and r["applies_to_member_attr"] == "true"]
    acct_prop = [r for r in rows if r["dim_type"] == "Account"
                 and r["applies_to_member_attr"] == "false"]
    assert len(acct_attr) == 3  # alias, description, displayMemberGroup
    assert len(acct_prop) == 3  # AccountType, IsIC, Formula
    at = next(r for r in acct_prop if r["property_name"] == "AccountType")
    assert at["datatype"] == "enum"
    assert at["representative_value"] == "Revenue"
    assert at["valid_values"] == "Expense|Revenue"
    formula = next(r for r in acct_prop if r["property_name"] == "Formula")
    assert formula["valid_values"] == ""


def test_system_dim_rows_are_member_attrs():
    rows = system_dim_rows(SYSTEM_DIMS)
    assert all(r["applies_to_member_attr"] == "true" for r in rows)
    assert {r["dim_type"] for r in rows} == {"Consolidation", "View", "Time"}


def test_validate_catalog_passes_for_complete_xml():
    xml = build_catalog(SCHEMA, SYSTEM_DIMS)
    validate_catalog(xml, SCHEMA)  # should not raise


def test_validate_catalog_raises_on_missing_property():
    xml = build_catalog(SCHEMA, SYSTEM_DIMS)
    broken = xml.replace('<property name="IsIC" value="false" />', "")
    with pytest.raises(ValueError, match="IsIC"):
        validate_catalog(broken, SCHEMA)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/refcatalog/test_generate.py -k "rows or validate" -v`
Expected: FAIL — `ImportError: cannot import name 'schema_to_rows'`.

- [ ] **Step 3: Implement rows + validation**

Append to `scripts/refcatalog/generate.py`:

```python
import xml.dom.minidom as minidom

CSV_FIELDS = [
    "dim_type",
    "property_name",
    "datatype",
    "representative_value",
    "valid_values",
    "applies_to_member_attr",
]


def schema_to_rows(schema):
    rows = []
    for dtype, entry in schema.items():
        for attr in entry["memberAttrs"]:
            rows.append({
                "dim_type": dtype,
                "property_name": attr,
                "datatype": "text",
                "representative_value": "",
                "valid_values": "",
                "applies_to_member_attr": "true",
            })
        for prop in entry["properties"]:
            rows.append({
                "dim_type": dtype,
                "property_name": prop["name"],
                "datatype": prop["datatype"],
                "representative_value": prop.get("value", ""),
                "valid_values": "|".join(prop.get("valid", [])),
                "applies_to_member_attr": "false",
            })
    return rows


def system_dim_rows(system_dims):
    rows = []
    for dtype, cfg in system_dims.items():
        for attr in cfg["memberAttrs"]:
            rows.append({
                "dim_type": dtype,
                "property_name": attr,
                "datatype": "text",
                "representative_value": "",
                "valid_values": "",
                "applies_to_member_attr": "true",
            })
    return rows


def validate_catalog(xml, schema):
    """Assert well-formedness and that every schema property appears in the XML."""
    doc = minidom.parseString(xml)
    by_type = {}
    for dim in doc.getElementsByTagName("dimension"):
        dtype = dim.getAttribute("type")
        names = {p.getAttribute("name") for p in dim.getElementsByTagName("property")}
        by_type.setdefault(dtype, set()).update(names)
    for dtype, entry in schema.items():
        expected = {p["name"] for p in entry["properties"]}
        missing = expected - by_type.get(dtype, set())
        if missing:
            raise ValueError(
                f"{dtype}: properties missing from catalog XML: {sorted(missing)}"
            )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/refcatalog/test_generate.py -v`
Expected: PASS (all generate tests green).

- [ ] **Step 5: Commit**

```bash
git add scripts/refcatalog/generate.py tests/refcatalog/test_generate.py
git commit -m "feat(refcatalog): add CSV rows and catalog validation"
```

---

### Task 6: Generator CLI + produce artifacts

**Files:**
- Create: `scripts/gen-ref-catalog.py`
- Create (output, committed): `metadata/REF_CATALOG.xml`, `metadata/REF_CATALOG.schema.csv`

- [ ] **Step 1: Write the generator CLI**

Create `scripts/gen-ref-catalog.py`:

```python
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
```

- [ ] **Step 2: Run the generator**

Run: `python scripts/gen-ref-catalog.py`
Expected: prints `wrote REF_CATALOG.xml and REF_CATALOG.schema.csv (N rows)` with N in the few-hundreds; no traceback.

- [ ] **Step 3: Verify the XML is well-formed and SWF-free**

Run: `python -c "import xml.dom.minidom as m; d=m.parse('metadata/REF_CATALOG.xml'); print('dims', len(d.getElementsByTagName('dimension')), 'members', len(d.getElementsByTagName('member')))"`
Expected: `dims 15 members ...` (12 schema dims + 3 system dims), non-zero members.

Run: `python -c "t=open('metadata/REF_CATALOG.xml',encoding='utf-8').read(); assert 'SWF' not in t and 'StoreGroup' not in t and 'Tagetik' not in t; print('no SWF content')"`
Expected: `no SWF content` (no assertion error).

- [ ] **Step 4: Verify the CSV header and a sample row**

Run: `python -c "import csv; r=list(csv.DictReader(open('metadata/REF_CATALOG.schema.csv',encoding='utf-8'))); print(len(r),'rows'); print(r[0])"`
Expected: row count in the few-hundreds; first row is a dict with keys `dim_type, property_name, datatype, representative_value, valid_values, applies_to_member_attr`.

- [ ] **Step 5: Run the full test suite for the package**

Run: `python -m pytest tests/refcatalog/ -v`
Expected: PASS (all tests green).

- [ ] **Step 6: Commit**

```bash
git add scripts/gen-ref-catalog.py metadata/REF_CATALOG.xml metadata/REF_CATALOG.schema.csv
git commit -m "feat(refcatalog): generate neutral catalog XML and schema CSV"
```

---

## Self-Review Notes

- **Spec coverage:** Extractor (Task 2–3) → `schema.json`; generator XML (Task 4) → `REF_CATALOG.xml`; CSV (Task 5) → `REF_CATALOG.schema.csv`; system dims (Task 4) cover Consolidation/View/Time; validation (Task 5) covers the spec's "every property present + well-formed" checks; neutral naming enforced and asserted (Task 6, Step 3). One representative value per property comes from `pick_representative` (Task 1).
- **Datatype set:** spec lists `bool|enum|int|text`; `infer_datatype` returns exactly those.
- **Naming consistency:** `build_member`, `build_dimension`, `build_system_dimension`, `build_catalog`, `schema_to_rows`, `system_dim_rows`, `validate_catalog`, `CSV_FIELDS`, `NAME_PREFIX`, `SYSTEM_DIMS`, `extract_schema`, `infer_datatype`, `pick_representative` are used identically across tasks and CLIs.
- **Coverage note:** the spec's validation item "value counts match" is realized as the property-presence check in `validate_catalog`; exact per-value count assertions were dropped as redundant (each property is emitted once per member by construction).
