import xml.dom.minidom as minidom

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


def validate_catalog(catalog_xml, schema):
    """Assert well-formedness and that every schema property appears in the XML."""
    doc = minidom.parseString(catalog_xml)
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
