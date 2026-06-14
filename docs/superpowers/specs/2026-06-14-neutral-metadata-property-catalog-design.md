# Neutral OneStream Metadata Property Catalog — Design

**Date:** 2026-06-14
**Status:** Approved (pending spec review)

## Purpose

Produce a "fake" company OneStream XF metadata artifact, structurally identical to
`metadata/SWF.xml` but containing **no SWF-specific content**. The goal is a
**property catalog / reference**: cover every OneStream dimension type and every
property with a single representative valid value, so the property names, datatypes,
defaults, and valid-value domains can be used to seed **master metadata tables**.

This is not a realistic demo company. Member names are neutral placeholders. The
value of the artifact is the *schema coverage*, not the data.

## Scope Decisions (confirmed)

- **Primary goal:** Property catalog / reference (not a realistic sample company).
- **Dimension coverage:** All OneStream dimension types.
- **Value coverage:** One representative valid value per property (not full enum coverage).
- **Naming:** Neutral placeholders (no industry flavor).
- **Approach:** C — single source of truth that emits both an importable XML and a
  structured schema table.

## OneStream Metadata Structure (from SWF.xml)

```
OneStreamXF (version="9.2.0.18004")
└ metadataRoot
  └ dimensions
    └ dimension (type, name, accessGroup, maintenanceGroup, description,
                 inheritedDim, dimMemberSourceType, dimMemberSourcePath, dimMemberSourceNVPairs)
      ├ members
      │   └ member (name, alias, description, + type-specific attrs)
      │       └ properties
      │           └ property (name, value [, time])
      └ relationships
          └ relationship (parent, child)
```

### Per-type property schemas (extracted from SWF.xml)

| Dim type | # props | Representative properties |
|----------|---------|---------------------------|
| Account  | 42 | AccountType, IsIC, IsConsolidated, Enable{Flow,IC,Origin,UD1–8}Aggregation, {UD1–8,IC,Flow}Constraint, Formula, FormulaType, PlugAccount, Text1/4/5, WorkflowChannel |
| Entity   | 29 | Currency, AllowAdjustments, AllowAdjustmentsFromChildren, IsIC, IsConsolidated, SiblingConsolidationPass, UD{1–8}Default, UD{1–8}Constraint |
| Flow     | 12 | FlowProcessingType, SwitchSign, SwitchType, AllowInput, AlternateInputCurrency, Formula, FormulaType |
| Scenario | 32 | ScenarioType, InputFrequency, DefaultView, ConsolidationView, Fx{Rate,Rule}Type*, Workflow*, *Group |
| UD1      | 34 | base UD props + UD{2–8}Default, UD{2–8}Constraint, WorkflowChannel |
| UD2–UD8  | 20 | AllowInput, IsAttributeMember, IsConsolidated, Formula, FormulaType, AlternateCurrencyForDisplay, AttributeMember* (Comparison/Operator/PropType/RelatedDimType/Source/Expression) |

### System dimensions (Consolidation, View, Time)

These are OneStream **system dimensions** with fixed standard members and a thin/empty
property model. They are included for completeness with their standard members and
**no rich property schema** — this is accurate to OneStream behavior, not an omission.
There is **no separate "IC" dimension type**; intercompany is the `IsIC` flag on
Entity (and Account).

### Member-attribute differences by type

Member-level attributes vary by dimension type and must be captured alongside
properties:
- Account / UD*: `name, alias, description, displayMemberGroup`
- Entity: adds `readDataGroup, readDataGroup2, readWriteDataGroup, readWriteDataGroup2, useCubeData…`
- Scenario: `name, alias, description, readDataGroup, readWriteDataGroup`

## Architecture (Approach C)

Two phases. **Extract** the schema from SWF.xml once (committed), then **generate**
the two neutral artifacts from that schema (no SWF dependency at generate time).

```
SWF.xml ──(extract-swf-schema.py)──> REF_CATALOG.schema.json (source of truth)
REF_CATALOG.schema.json ──(gen-ref-catalog.py)──┬──> REF_CATALOG.xml
                                                └──> REF_CATALOG.schema.csv (+ .json mirror)
```

### 1. Extractor — `scripts/extract-swf-schema.py`

Reads `metadata/SWF.xml` and derives the schema by inspecting real data — no
hand-typing of ~290 property descriptors. For each dimension type it:
- Collects the **union of property names** across all members of that type (ordered).
- Collects the **set of distinct values** each property takes across all members.
- **Infers `datatype`** from those values:
  - `bool` if distinct non-empty values ⊆ {`true`,`false`}
  - `int` if all non-empty values are integers
  - `enum` if a small set (≤ 15) of short token-like values (no spaces, not pure freeform)
  - `text` otherwise
- Picks a **representative `value`**: for `enum`/`bool`/`int` the most frequent
  non-empty distinct value; for `text` the value is **forced to `""`** (free-text and
  formula values are real business content and must not leak into the neutral catalog).
  `""` if the property is always empty.
- Records the **`valid`** domain (the distinct non-empty values) for `enum`/`bool`.
- Records the type's **member-attribute names** (union across members).

Writes `metadata/REF_CATALOG.schema.json`.

### Source of truth — `metadata/REF_CATALOG.schema.json`

Per dimension type, an ordered property list plus member attrs:

```json
{
  "Account": {
    "memberAttrs": ["alias", "description", "displayMemberGroup"],
    "properties": [
      {"name": "AccountType", "datatype": "enum", "value": "Revenue",
       "valid": ["Revenue","Expense","Asset","Liability","..."]},
      {"name": "IsIC", "datatype": "bool", "value": "false", "valid": ["true","false"]},
      {"name": "Formula", "datatype": "text", "value": ""}
    ]
  },
  "Entity": { "...": "..." }
}
```

Field meanings:
- `name` — exact OneStream property name.
- `datatype` — one of `bool | enum | int | text`.
- `value` — one representative valid value (used in the XML).
- `valid` — distinct-value domain for `enum`/`bool` (reference for master tables); omitted otherwise.

Note: `value` is harvested from real SWF data but member *names* in the output are
neutral placeholders, so no SWF business content leaks into the catalog.

### 2. Generator — `scripts/gen-ref-catalog.py`

Reads `REF_CATALOG.schema.json` and emits both artifacts. Pure standard-library Python
(string building + `csv`/`json`/`xml.dom.minidom`), no new dependencies.

### 3. Artifact A — `metadata/REF_CATALOG.xml`

OneStream-importable, identical structure to SWF.xml:
- `OneStreamXF version="9.2.0.18004"` → `metadataRoot` → `dimensions`.
- One `dimension` per type, neutral names:
  - Account dim `REF_Account`, members `ACC_TOTAL` → `ACC_0001`
  - Entity dim `REF_Entity`, `ENT_TOTAL` → `ENT_001`
  - Flow dim `REF_Flow`, Scenario dim `REF_Scenario` (`SC_ACTUAL`)
  - UD1–UD8 dims `REF_UD1`…`REF_UD8`, members `UD1_001`…
  - Consolidation/View/Time: standard system members
- Each dimension's **lead member carries the full property union** for its type, one
  representative value per property.
- 1–2 child members per dimension + a `relationships` block so each hierarchy is valid.

### 4. Artifact B — `metadata/REF_CATALOG.schema.csv` (+ mirror `.json`)

Flat rows to seed master metadata tables:

```
dim_type, property_name, datatype, representative_value, valid_values, applies_to_member_attr
```

- One row per (dim_type, property).
- Member-level attributes also emitted as rows with `applies_to_member_attr = true`.

## Validation

After generation the script self-verifies:
1. XML is well-formed (parse it back).
2. Every property in the schema JSON appears in the XML for its dim type.
3. Property value counts in XML match the schema definition counts.
4. CSV row count == total properties + member attributes across all dim types.

Failure aborts with a non-zero exit and a clear message; no partial artifacts left in
a passing state.

## Deliverables

- `scripts/extract-swf-schema.py` — extracts schema from SWF.xml
- `metadata/REF_CATALOG.schema.json` — source of truth (generated, committed)
- `scripts/gen-ref-catalog.py` — generator + validator
- `metadata/REF_CATALOG.xml` — importable neutral catalog
- `metadata/REF_CATALOG.schema.csv` — master-table seed rows

## Out of Scope (YAGNI)

- Full enum-value coverage (only one representative value per property).
- Realistic/industry member data.
- Loading rows into actual database tables (artifact is the seed source; loading is a
  separate task).
- Round-trip re-export comparison against SWF.xml.
