import urllib.request
import os
import ssl
import time

# Disable SSL verification for corporate environments
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Target directory
target_dir = os.path.dirname(os.path.abspath(__file__))

# Base URL for latest docs
base = "https://documentation.onestream.com/docs/Content/PDFs"

# Comprehensive list of PDFs discovered from the OneStream documentation site
pdf_urls = [
    # Platform Guides
    f"{base}/BI_Blend_Guide.pdf",
    f"{base}/BI_Viewer_Guide.pdf",
    f"{base}/BrowserUX_Guide.pdf",
    f"{base}/Design_and_Reference_Guide.pdf",
    f"{base}/Pivot_Grids_User_Guide.pdf",
    f"{base}/Table_Views_Guide.pdf",
    f"{base}/Modern%20Browser%20Experience%20Guide.pdf",
    f"{base}/Navigation_Center_Guide.pdf",

    # Solution Guides - User Guides
    f"{base}/ACM_Guide.pdf",
    f"{base}/ACM_PV7.4.0_SV200_ReleaseNotes.pdf",
    f"{base}/AST_PV7.4.0_SV101_Instructions.pdf",
    f"{base}/AST_PV7.4.0_SV101_ReleaseNotes.pdf",
    f"{base}/BAI_Parser_Guide.pdf",
    f"{base}/BAI_Parser_ReleaseNotes.pdf",
    f"{base}/CAT_Guide.pdf",
    f"{base}/CAT_ReleaseNotes.pdf",
    f"{base}/Compliance_Guide.pdf",
    f"{base}/Compliance_ReleaseNotes.pdf",
    f"{base}/Data_Entry_123_Guide.pdf",
    f"{base}/Data_Entry_123_ReleaseNotes.pdf",
    f"{base}/DCU_Guide.pdf",
    f"{base}/DCU_ReleaseNotes.pdf",
    f"{base}/Excel_Add-in_Installer_Guide.pdf",
    f"{base}/Excel_Add-in_Installer_ReleaseNotes.pdf",
    f"{base}/FEM_Guide.pdf",
    f"{base}/FEM_ReleaseNotes.pdf",
    f"{base}/Guided_Reporting_Guide.pdf",
    f"{base}/Guided_Reporting_ReleaseNotes.pdf",
    f"{base}/Help_Desk_Guide.pdf",
    f"{base}/Help_Desk_ReleaseNotes.pdf",
    f"{base}/Load_Test_Suite_Guide.pdf",
    f"{base}/Load_Test_Suite_ReleaseNotes.pdf",
    f"{base}/MPST_Guide.pdf",
    f"{base}/MPST_ReleaseNotes.pdf",
    f"{base}/Metadata_Builder_Guide.pdf",
    f"{base}/Metadata_Builder_ReleaseNotes.pdf",
    f"{base}/Financial_Close_Guide.pdf",
    f"{base}/Financial_Close_ReleaseNotes.pdf",
    f"{base}/OST_Guide.pdf",
    f"{base}/OST_ReleaseNotes.pdf",
    f"{base}/Parcel_Service_Guide.pdf",
    f"{base}/Parcel_Service_ReleaseNotes.pdf",
    f"{base}/Power_BI_Connector_Guide.pdf",
    f"{base}/Power_BI_Connector_ReleaseNotes.pdf",
    f"{base}/Planning_Guide.pdf",
    f"{base}/Planning_ReleaseNotes.pdf",
    f"{base}/Predictive_Analytics_123_Guide.pdf",
    f"{base}/Predictive_Analytics_123_ReleaseNotes.pdf",
    f"{base}/PCM_Guide.pdf",
    f"{base}/PCM_ReleaseNotes.pdf",
    f"{base}/Scenario_Analysis_123_Guide.pdf",
    f"{base}/Scenario_Analysis_123_ReleaseNotes.pdf",
    f"{base}/Security_Audit_Reports_Guide.pdf",
    f"{base}/Security_Audit_Reports_ReleaseNotes.pdf",
    f"{base}/Sensible_Machine_Learning_Guide.pdf",
    f"{base}/Sensible_Machine_Learning_ReleaseNotes.pdf",
    f"{base}/Snippet_Editor_Guide.pdf",
    f"{base}/Snippet_Editor_ReleaseNotes.pdf",
    f"{base}/Standard_Application_Reports_Guide.pdf",
    f"{base}/Standard_Application_Reports_ReleaseNotes.pdf",
    f"{base}/Standard_System_Reports_Guide.pdf",
    f"{base}/Standard_System_Reports_ReleaseNotes.pdf",
    f"{base}/System_Diagnostics_Guide.pdf",
    f"{base}/System_Diagnostics_ReleaseNotes.pdf",
    f"{base}/TDM_Guide.pdf",
    f"{base}/TDM_ReleaseNotes.pdf",
    f"{base}/Task_Manager_Guide.pdf",
    f"{base}/Task_Manager_ReleaseNotes.pdf",
    f"{base}/XperiFlow_Guide.pdf",
    f"{base}/XperiFlow_ReleaseNotes.pdf",
    f"{base}/Actor_Workspace_Guide.pdf",
    f"{base}/Actor_Workspace_ReleaseNotes.pdf",
    f"{base}/Train_Me_Guide.pdf",
    f"{base}/Train_Me_ReleaseNotes.pdf",
    f"{base}/Powershell_Scripting_Guide.pdf",
    f"{base}/Powershell_Scripting_ReleaseNotes.pdf",

    # ESG
    f"{base}/ESG_PV9.0.0_SV100_ReleaseNotes.pdf",
    f"{base}/ESG_Guide.pdf",

    # Narrative Reporting
    f"{base}/Narrative_Reporting_Guide.pdf",
    f"{base}/Narrative_Reporting_ReleaseNotes.pdf",

    # System Guides
    f"{base}/API_Overview_Guide.pdf",
    f"{base}/Identity_and_Access_Management_Guide.pdf",
    f"{base}/Installation_and_Configuration_Guide.pdf",
    f"{base}/REST_API_Implementation_Guide.pdf",
    f"{base}/Solution_Descriptions_Guide.pdf",
    f"{base}/Smart_Integration_Connector_Guide.pdf",
    f"{base}/Third_Party_Component_Guide.pdf",
    f"{base}/Upgrade_Guide.pdf",
    f"{base}/BrowserUX_Upgrade_Guide.pdf",
    f"{base}/Support_Resources_Guide.pdf",

    # Release Notes (Platform) - current docs version
    f"{base}/OneStream_Version_9.1.0_Release_Notes.pdf",
    f"{base}/OneStream_Version_9.0.0_Release_Notes.pdf",
    f"{base}/OneStream_Version_8.5.0_Release_Notes.pdf",
    f"{base}/OneStream_Version_8.4.3_Release_Notes.pdf",
    f"{base}/OneStream_Version_8.4.0_Release_Notes.pdf",
    f"{base}/OneStream_Version_8.2.4_Release_Notes.pdf",
    f"{base}/OneStream_Version_8.2.3_Release_Notes.pdf",
    f"{base}/OneStream_Version_8.1.3_Release_Notes.pdf",
    f"{base}/OneStream_Version_8.1.2_Release_Notes.pdf",
    f"{base}/OneStream_Version_8.0.0_Release_Notes.pdf",
    f"{base}/OneStream_Version_8.0.1_Release_Notes.pdf",
    f"{base}/OneStream_Version_7.4.4_Release_Notes.pdf",
    f"{base}/OneStream_Version_7.3.6_Release_Notes.pdf",
    f"{base}/OneStream_Version_7.2.5_Release_Notes.pdf",
    f"{base}/OneStream_Version_7.1.3_Release_Notes.pdf",
    f"{base}/OneStream_Version_7.0.0_Release_Notes.pdf",

    # Glossary
    f"{base}/OneStream_Glossary.pdf",
    f"{base}/Glossary.pdf",

    # Additional variant names found from 8.2 page
    f"{base}/OneStream_Version_9.2.0_Release_Notes.pdf",
    f"{base}/OneStream_Version_9.0.1_Release_Notes.pdf",
    f"{base}/OneStream_Version_9.1.1_Release_Notes.pdf",
    f"{base}/OneStream_Version_8.5.4_Release_Notes.pdf",
    f"{base}/OneStream_Version_8.4.4_Release_Notes.pdf",
]

# Additional older version PDFs from different base paths
older_base_urls = [
    "https://documentation.onestream.com/8.2.4/Content/PDFs",
    "https://documentation.onestream.com/1375907/Content/PDFs",
    "https://documentation.onestream.com/1388457/Content/PDFs",
    "https://documentation.onestream.com/1389761/Content/PDFs",
]

for old_base in older_base_urls:
    for rn in [
        "OneStream_Version_8.0.0_Release_Notes.pdf",
        "OneStream_Version_8.1.2_Release_Notes.pdf",
        "OneStream_Version_8.1.3_Release_Notes.pdf",
        "OneStream_Version_8.2.3_Release_Notes.pdf",
        "OneStream_Version_8.2.4_Release_Notes.pdf",
        "OneStream_Version_8.5.0_Release_Notes.pdf",
        "OneStream_Version_7.4.4_Release_Notes.pdf",
        "OneStream_Version_7.3.6_Release_Notes.pdf",
        "OneStream_Version_7.2.5_Release_Notes.pdf",
        "OneStream_Version_7.1.3_Release_Notes.pdf",
        "OneStream_Version_7.0.0_Release_Notes.pdf",
    ]:
        pdf_urls.append(f"{old_base}/{rn}")

# De-duplicate URLs
seen = set()
unique_urls = []
for u in pdf_urls:
    if u not in seen:
        seen.add(u)
        unique_urls.append(u)

print(f"Attempting to download {len(unique_urls)} unique PDF URLs...")
print(f"Target directory: {target_dir}")
print()

downloaded = []
failed = []

for url in unique_urls:
    # Extract filename from URL
    fname = url.split("/")[-1]
    fname = urllib.parse.unquote(fname)
    
    # Skip if already downloaded (same filename from different base)
    fpath = os.path.join(target_dir, fname)
    if os.path.exists(fpath) and os.path.getsize(fpath) > 1000:
        print(f"  SKIP (exists): {fname}")
        downloaded.append(fname)
        continue
    
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            content_type = resp.headers.get("Content-Type", "")
            data = resp.read()
            
            # Check if we got a PDF (not a login/redirect page)
            if len(data) < 500 or (b"Secure Login" in data[:2000] and b"%PDF" not in data[:10]):
                print(f"  FAIL (login redirect): {fname}")
                failed.append((fname, "login redirect"))
                continue
            
            if b"%PDF" not in data[:10] and "pdf" not in content_type.lower():
                print(f"  FAIL (not a PDF): {fname}")
                failed.append((fname, "not PDF content"))
                continue
            
            with open(fpath, "wb") as f:
                f.write(data)
            
            size_kb = len(data) / 1024
            print(f"  OK: {fname} ({size_kb:.0f} KB)")
            downloaded.append(fname)
    except Exception as e:
        err_msg = str(e)[:80]
        print(f"  FAIL: {fname} - {err_msg}")
        failed.append((fname, err_msg))
    
    time.sleep(0.3)  # Be polite

print(f"\n{'='*60}")
print(f"Downloaded: {len(downloaded)} files")
print(f"Failed: {len(failed)} files")
if failed:
    print("\nFailed files:")
    for fname, reason in failed:
        print(f"  - {fname}: {reason}")
