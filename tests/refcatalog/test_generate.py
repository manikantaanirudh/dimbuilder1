import xml.dom.minidom as minidom

import pytest

from refcatalog.generate import (
    build_catalog,
    build_dimension,
    build_member,
    schema_to_rows,
    system_dim_rows,
    validate_catalog,
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
