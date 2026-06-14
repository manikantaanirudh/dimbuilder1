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
