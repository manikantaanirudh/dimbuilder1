# Synthetic metadata CSV fixtures

Use these files to test **Import CSV** in Dim Builder (Account dimension).

## Files

| File | Format | Rows |
|------|--------|------|
| `synthetic-parent-child.csv` | Single `parent` + `member` columns | 40 valid + 8 intentional faults |
| `synthetic-level-columns.csv` | Stacked `L01` / `L02` / `L03` + `member` | 40 valid + 8 intentional faults |

## Import settings (both files)

- **Dimension type:** Account  
- **Dimension name:** SyntheticAccounts (or any name)  
- **Default Account Type:** `Expense` (optional if you map `AccountType` below)  
- **Member key:** `member`  
- **Description:** `description`  
- **Member properties (optional):** map file column `AccountType` → **Account Type**  

### Parent-child file

- **Hierarchy:** Single parent column  
- **Parent key:** `parent`  

### Level-columns file

- **Hierarchy:** Stacked level columns  
- **Level 1 (top):** `L01_Group`  
- **Level 2:** `L02_Category`  
- **Level 3:** `L03_SubCategory`  

## Expected hierarchy (valid rows)

Top → bottom (same shape as Opex `L01` → `L02` → `L03` → account):

`Income Statement` → `Operating Expenses` → `Facilities` → `619290`

Revenue leaves use: `Income Statement` → `Revenue` → `Product Revenue` → `410010`.

Level-columns file maps:

| Level | Column | Example value |
|-------|--------|----------------|
| 1 (top) | `L01_Group` | Income Statement |
| 2 | `L02_Category` | Operating Expenses |
| 3 | `L03_SubCategory` | Facilities |
| Leaf | `member` | 619290 |

## Intentional fault rows (last 8 rows in each file)

| Member / row | Issue | Expected |
|--------------|--------|----------|
| `BAD_SELF` (parent-child only) | Parent equals member | Import preview **error** |
| `610010` twice | Duplicate member | Duplicate member warning/error |
| `610998` + `MissingParent_XYZ` | Parent key not in file | Unknown relationship / parent warnings |
| Empty `member` | Missing member key | Preview **error** |
| `Bad?Name` | Restricted `?` | Error: restricted character |
| ` 610099 ` | Leading/trailing spaces | Warning: whitespace |
| `TOOLONGNAME_…` | Key length > 500 | Error: name too long |
| `610999` / empty `L03` / wrong L02 | Skipped or inconsistent hierarchy | Orphan / hierarchy warnings |

Re-import after fixing faults to get a clean project.
