# XML Generation Guide

OneStream XML generation is implemented in `src/shared/xmlExport.ts`.

## Input

The exporter receives:

- `project`
- `dimensions`
- `members`
- `relationships`

These are the same records used by the rest of the app, so XML generation works for blank blueprint projects, edited projects, and XLSX-seeded projects.

## Output Shape

The exporter renders:

```xml
<?xml version="1.0" encoding="utf-8"?>
<OneStreamXF version="...">
  <metadataRoot>
    <dimensions>
      <dimension ...>
        <members>
          <member ... />
        </members>
        <relationships>
          <relationship ... />
        </relationships>
      </dimension>
    </dimensions>
  </metadataRoot>
</OneStreamXF>
```

## Version Selection

`getOneStreamVersion()` uses the first dimension metadata value at `metadata.oneStreamVersion`. If not found, it uses `application.oneStreamVersionFallback`.

## Dimension Attributes

Each dimension includes:

- `type`
- `name`
- `accessGroup`
- `maintenanceGroup`
- `description`
- `inheritedDim`

When `includeDimensionSourceAttributes` is enabled, the exporter also emits:

- `dimMemberSourceType`
- `dimMemberSourcePath`
- `dimMemberSourceNVPairs`

## Member Rendering

Members are filtered by dimension. Blank member rows are skipped when `skipBlankMemberRows` is true.

Common attributes:

- `name`
- `alias`
- `description`

Some fields become direct member attributes depending on dimension type, such as display and read groups.

Remaining non-empty fields render as:

```xml
<property name="PropertyName" value="Value" />
```

## Relationship Rendering

Relationships are filtered by dimension and require both parent and child keys.

Common attributes:

- `parent`
- `child`

For dimensions other than `Scenario` and `Entity`, `aggregationWeight` is emitted as an attribute when available.

For `Entity`, additional relationship fields such as percent consolidation and ownership values can render as properties.

## Field Name Mapping

`toOneStreamPropertyName()` maps workbook/app field names to OneStream XML property names. The exporter first preserves explicit mappings that existed before the dictionary, then consults the shared OneStream property dictionary in `src/shared/oneStreamPropertyDictionary.ts`, then falls back to `toXmlAttributeName()`.

The dictionary lets XML export understand aliases such as `Acct Type` for `Account Type`, while still emitting the canonical XML property name. Unknown non-empty properties are retained and exported through fallback XML-name conversion so imported or user-added metadata is not silently dropped.

Explicit overrides cover known OneStream naming differences, for example:

- `Aggregation Weight` -> `AggregationWeight`
- `Percent Consol` -> `PercentConsolidation`
- `Use Cube FX Settings` -> `UseCubeFxSettings`

Dictionary-backed fields and unknown fields are tested in `src/test/xmlExport.test.ts`.

## Escaping And Filtering

The exporter:

- escapes XML special characters
- normalizes cell values
- skips formula error values when configured
- can minify XML when `prettyPrint` is false

## Tests

Primary coverage:

- `src/test/xmlExport.test.ts`
- `src/test/projectBlueprints.test.ts`
- `src/test/workbookParser.test.ts`
