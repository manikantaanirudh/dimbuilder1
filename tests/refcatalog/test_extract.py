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
