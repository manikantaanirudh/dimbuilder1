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
