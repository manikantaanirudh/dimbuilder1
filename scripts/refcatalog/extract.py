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
