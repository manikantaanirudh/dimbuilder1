# XML Generation Guide

OneStream XML generation is implemented in `src/shared/xmlExport.ts`.

## Input

The exporter receives:

- `project`
- `dimensions`
- `members`
- `relationships`
- `varyingPropertyValues`
- optional relationship load mode and relationship operation plan

These are the same records used by the rest of the app, so XML generation works for blank blueprint projects, edited projects, XLSX-seeded projects, and XML-imported projects.

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

Remaining non-empty fields render as property elements. Properties that support varying in OneStream always emit their context attributes (even when empty), matching real OneStream 9.2.0 metadata extract format:

```xml
<!-- Non-varying property (no context attributes) -->
<property name="AccountType" value="Revenue" />

<!-- Scenario+time varying property -->
<property name="Formula" scenarioType="" time="" revertToDefaultScenarioType="false" value="..." />
<property name="InUse" scenarioType="" time="" revertToDefaultScenarioType="false" value="True" />

<!-- Scenario-only varying property -->
<property name="WorkflowChannel" scenarioType="" value="NoDataLock" />

<!-- Cube-type varying property -->
<property name="FlowConstraint" cubeType="" value="root" />
```

The varying context type for each property is determined by the OneStream property dictionary (`varyingContextType` field). Three context patterns exist:

- `scenarioTime`: emits `scenarioType=""` `time=""` `revertToDefaultScenarioType="false"`
- `scenario`: emits `scenarioType=""` only
- `cubeType`: emits `cubeType=""` only

If a member has explicit varying property values (stored in `varying_property_values`), those are appended with their specific context values:

```xml
<property name="Text1" scenarioType="Actual" time="2026M1" revertToDefaultScenarioType="false" value="Finance note" />
```

When `emitAllSchemaProperties` is true, all schema-defined properties are emitted for each member/relationship (even with empty values), matching OneStream's full extraction format.

## Relationship Rendering

Relationships are filtered by dimension and require both parent and child keys.

Common attributes:

- `parent`
- `child`

For dimensions other than `Scenario` and `Entity`, `aggregationWeight` is emitted as an attribute when available.

For `Entity`, additional relationship fields such as percent consolidation and ownership values can render as properties.

Relationship varying properties use the same conservative property-node shape as member varying properties. Blank context axes are omitted from the XML attributes, and unknown property names are retained through fallback XML-name conversion.

## Relationship Operation Planning Blocks

Full XML export remains backward compatible and does not emit relationship operation planning data.

When `GET /api/export/:projectId/xml` is called with a non-full `mode`, the server builds a relationship plan through `src/shared/relationshipOperations.ts` and passes it to `src/shared/xmlExport.ts`. The exporter appends a deterministic planning block after `<dimensions>`:

```xml
<relationshipOperations mode="moveCopy" total="2" warnings="1" errors="0">
  <relationshipOperation operation="move" dimensionType="Account" dimensionName="Accounts" parent="NewParent" child="Revenue" oldParent="OldParent" newParent="NewParent" severity="warning" />
</relationshipOperations>
```

This block is a safe internal representation for review and release planning. It keeps relationship deletes, moves, copies, and break/build intent explicit without pretending the final OneStream delete/move XML syntax is fully confirmed.

## Field Name Mapping

`toOneStreamPropertyName()` maps workbook/app field names to OneStream XML property names. The exporter first preserves explicit mappings that existed before the dictionary, then consults the shared OneStream property dictionary in `src/shared/oneStreamPropertyDictionary.ts`, then falls back to `toXmlAttributeName()`.

The dictionary lets XML export understand aliases such as `Acct Type` for `Account Type`, while still emitting the canonical XML property name. Unknown non-empty properties are retained and exported through fallback XML-name conversion so imported or user-added metadata is not silently dropped.

Explicit overrides cover known OneStream naming differences, for example:

- `Aggregation Weight` -> `AggregationWeight`
- `Percent Consol` -> `PercentConsolidation`
- `Use Cube FX Settings` -> `UseCubeFxSettings`

Dictionary-backed fields and unknown fields are tested in `src/test/xmlExport.test.ts`.

## XML Import Round Trip

OneStream XML import is implemented in `src/shared/xmlImport.ts` and exposed through `POST /api/import/xml`.

The parser reads the app's current XML shape and creates editable project records. Known XML attributes and property elements are mapped back to dimension fields, member properties, and relationship properties through the same shared property dictionary used by export.

Unknown XML data is preserved in existing JSON fields:

- dimension-level unknown data is stored in `dimensions.metadata_json` under `__unknownXml`
- member-level unknown data is stored in `dimension_members.properties_json` under `__unknownXml`
- relationship-level unknown data is stored in `dimension_relationships.properties_json` under `__unknownXml`

During export, known generated attributes and properties are written first. Preserved unknown attributes and property elements are appended only when a known edited value has not already claimed the same XML name. Unsupported child elements are re-emitted after the known property block in deterministic source order.

This means edited known fields win, while unknown untouched XML fields remain available for review/import back into downstream OneStream tooling.

## Varying Property Export

Varying property rows come from `varying_property_values` and are included by `src/server/routes/export.ts` in the XML snapshot. `src/shared/xmlExport.ts` keeps the existing flat property output intact, then emits deterministic contextual property nodes for matching dimension, member, or relationship targets.

The XML format matches real OneStream 9.2.0 metadata extracts. Each varying property always emits its context attributes (even when empty), and uses the `time` attribute name (not `timeMember`). The `revertToDefaultScenarioType` attribute is always present for scenario+time varying properties.

## Empty Elements

Dimensions with no members or relationships emit self-closing elements:

```xml
<members />
<relationships />
```

## Escaping And Filtering

The exporter:

- escapes XML special characters
- normalizes cell values
- skips formula error values when configured
- can minify XML when `prettyPrint` is false

## Tests

Primary coverage:

- `src/test/xmlExport.test.ts`
- `src/test/relationshipOperations.test.ts`
- `src/test/xmlImport.test.ts`
- `src/test/projectBlueprints.test.ts`
- `src/test/workbookParser.test.ts`
