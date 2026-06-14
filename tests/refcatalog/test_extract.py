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
