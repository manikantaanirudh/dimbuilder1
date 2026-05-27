Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
$ErrorActionPreference = "Continue"

$baseUrl = "http://127.0.0.1:8787"
$headers = @{"Content-Type"="application/json"}
$output = @()

function Do-Step {
    param($step, $name, $method, $url, $body, $timeout)
    if (-not $timeout) { $timeout = 15 }
    $result = @{Step=$step; Name=$name; Method=$method; Url=$url; Status=""; Code=""; Data=""; Notes=""; Pass=$false}
    try {
        $params = @{
            Uri = $url
            Method = $method
            TimeoutSec = $timeout
            UseBasicParsing = $true
        }
        if ($method -ne "GET" -and $body) {
            $params["Body"] = $body
            $params["ContentType"] = "application/json"
        }
        $resp = Invoke-WebRequest @params
        $result.Code = $resp.StatusCode
        if ($resp.Content -is [byte[]]) {
            $result.Data = "[Binary: $($resp.Content.Length) bytes]"
        } else {
            $result.Data = $resp.Content
        }
        $result.Pass = $true
        $result.Status = "PASS"
    } catch {
        $result.Notes = $_.Exception.Message
        if ($_.Exception.Response) {
            $result.Code = [int]$_.Exception.Response.StatusCode
            try {
                $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $result.Data = $sr.ReadToEnd()
                $sr.Close()
            } catch {}
        }
        $result.Status = "FAIL"
    }
    Write-Host "--- Step $step : $name ---"
    Write-Host "  $method $url"
    Write-Host "  HTTP $($result.Code)"
    $dataStr = ""
    if ($result.Data -is [byte[]]) {
        $dataStr = "[Binary: $($result.Data.Length) bytes]"
    } elseif ($result.Data -is [string]) {
        $dataStr = if ($result.Data.Length -gt 200) { $result.Data.Substring(0,200) + "..." } else { $result.Data }
    } else {
        $dataStr = "$($result.Data)"
    }
    Write-Host "  Data: $dataStr"
    Write-Host "  Status: $($result.Status)"
    if ($result.Notes) { Write-Host "  Notes: $($result.Notes)" }
    Write-Host ""
    return $result
}

# ===== STEP 1: List Projects =====
$r1 = Do-Step 1 "List Projects" "GET" "$baseUrl/api/projects"
$projects = $r1.Data | ConvertFrom-Json
Write-Host "  -> Found $($projects.Count) projects"

# ===== STEP 2: Create Project =====
$body = '{"name":"Audit Test Project","description":"Workflow proof test"}'
$r2 = Do-Step 2 "Create Project" "POST" "$baseUrl/api/projects" $body
$project = $r2.Data | ConvertFrom-Json
$projectId = $project.id
Write-Host "  -> Project ID: $projectId"

if (-not $projectId) { Write-Host "FATAL: No project ID"; exit 1 }

# ===== STEP 3: List Dimensions =====
$r3 = Do-Step 3 "List Dimensions" "GET" "$baseUrl/api/projects/$projectId/dimensions"
$dims = $r3.Data | ConvertFrom-Json
if ($dims -is [array]) {
    Write-Host "  -> Found $($dims.Count) dimensions"
    $dimId = $dims[0].id
    $dimName = $dims[0].name
} else {
    Write-Host "  -> Response: $($r3.Data)"
    $dimId = $dims.id
    $dimName = $dims.name
}
Write-Host "  -> Using dim: $dimName ($dimId)"

if (-not $dimId) { Write-Host "FATAL: No dim ID"; exit 1 }

# ===== STEP 4: Get Members =====
$r4 = Do-Step 4 "Get Members" "GET" "$baseUrl/api/projects/$projectId/dimensions/$dimId/members"
$membersData = $r4.Data | ConvertFrom-Json
if ($membersData -is [array]) {
    Write-Host "  -> Member count: $($membersData.Count)"
} elseif ($membersData.value) {
    Write-Host "  -> Member count: $($membersData.value.Count)"
} else {
    Write-Host "  -> Members response type: $($membersData.GetType().Name)"
}

# ===== STEP 5: Create Member =====
$body = '{"memberKey":"TEST_MEMBER_01","description":"Audit test","properties":{}}'
$r5 = Do-Step 5 "Create Member" "POST" "$baseUrl/api/projects/$projectId/dimensions/$dimId/members" $body
if ($r5.Pass) {
    $newMember = $r5.Data | ConvertFrom-Json
    $memberId = $newMember.id
    Write-Host "  -> Member ID: $memberId"
} else {
    Write-Host "  -> Failed to create member"
    $memberId = $null
}

# ===== STEP 6: Create Relationship =====
$body = '{"parentKey":"Root","childKey":"TEST_MEMBER_01","properties":{}}'
$r6 = Do-Step 6 "Create Relationship" "POST" "$baseUrl/api/projects/$projectId/dimensions/$dimId/relationships" $body

# ===== STEP 7: Run Validation =====
$r7 = Do-Step 7 "Run Validation" "POST" "$baseUrl/api/validation/$projectId/run" "{}" 30

# ===== STEP 8: Create Snapshot =====
$body = '{"label":"Before changes"}'
$r8 = Do-Step 8 "Create Snapshot" "POST" "$baseUrl/api/projects/$projectId/snapshots" $body
if ($r8.Pass) {
    $snap = $r8.Data | ConvertFrom-Json
    $snapshotId = $snap.id
    Write-Host "  -> Snapshot ID: $snapshotId"
} else {
    $snapshotId = $null
    Write-Host "  -> Failed to create snapshot"
}

# ===== STEP 9: Edit Member =====
if ($memberId) {
    $body = '{"description":"Modified for diff test"}'
    $r9 = Do-Step 9 "Edit Member" "PATCH" "$baseUrl/api/projects/$projectId/members/$memberId" $body
} else {
    Write-Host "--- Step 9 : Edit Member ---"
    Write-Host "  SKIPPED - no member ID"
    $r9 = @{Step=9; Name="Edit Member"; Status="FAIL"; Notes="No member ID from step 5"; Pass=$false; Code="SKIP"; Data=""}
}

# ===== STEP 10: Create Baseline =====
if ($snapshotId) {
    $body = "{`"snapshotId`":`"$snapshotId`",`"label`":`"Test baseline`"}"
    $r10 = Do-Step 10 "Create Baseline" "POST" "$baseUrl/api/projects/$projectId/baselines" $body
    if ($r10.Pass) {
        $bl = $r10.Data | ConvertFrom-Json
        $baselineId = $bl.id
        Write-Host "  -> Baseline ID: $baselineId"
    } else {
        $baselineId = $null
    }
} else {
    Write-Host "--- Step 10 : Create Baseline ---"
    Write-Host "  SKIPPED - no snapshot ID"
    $r10 = @{Step=10; Name="Create Baseline"; Status="FAIL"; Notes="No snapshot ID"; Pass=$false; Code="SKIP"; Data=""}
    $baselineId = $null
}

# ===== STEP 11: Run Diff =====
if ($baselineId) {
    $r11 = Do-Step 11 "Run Diff" "POST" "$baseUrl/api/projects/$projectId/baselines/$baselineId/diff" "{}" 30
    if ($r11.Pass) {
        $diffResult = $r11.Data | ConvertFrom-Json
        $diffId = $diffResult.id
        Write-Host "  -> Diff ID: $diffId"
    } else {
        $diffId = $null
    }
} else {
    Write-Host "--- Step 11 : Run Diff ---"
    Write-Host "  SKIPPED - no baseline ID"
    $r11 = @{Step=11; Name="Run Diff"; Status="FAIL"; Notes="No baseline ID"; Pass=$false; Code="SKIP"; Data=""}
    $diffId = $null
}

# ===== STEP 12: List Diff Items =====
if ($diffId) {
    $r12 = Do-Step 12 "List Diff Items" "GET" "$baseUrl/api/projects/$projectId/diffs/$diffId/items"
} else {
    Write-Host "--- Step 12 : List Diff Items ---"
    Write-Host "  SKIPPED - no diff ID"
    $r12 = @{Step=12; Name="List Diff Items"; Status="FAIL"; Notes="No diff ID"; Pass=$false; Code="SKIP"; Data=""}
}

# ===== STEP 13: Create Change Set =====
if ($diffId) {
    $body = "{`"diffRunId`":`"$diffId`",`"label`":`"Test changeset`"}"
    $r13 = Do-Step 13 "Create Change Set" "POST" "$baseUrl/api/projects/$projectId/change-sets" $body
} else {
    Write-Host "--- Step 13 : Create Change Set ---"
    Write-Host "  SKIPPED - no diff ID"
    $r13 = @{Step=13; Name="Create Change Set"; Status="FAIL"; Notes="No diff ID"; Pass=$false; Code="SKIP"; Data=""}
}

# ===== STEP 14: Export XML =====
$r14 = Do-Step 14 "Export XML" "GET" "$baseUrl/api/export/$projectId/xml" $null 30

# ===== STEP 15: Export XLSX =====
$r15 = Do-Step 15 "Export XLSX" "GET" "$baseUrl/api/export/$projectId/xlsx" $null 30

# ===== STEP 16: Restore Snapshot =====
if ($snapshotId) {
    $r16 = Do-Step 16 "Restore Snapshot" "POST" "$baseUrl/api/projects/$projectId/snapshots/$snapshotId/restore" "{}"
} else {
    Write-Host "--- Step 16 : Restore Snapshot ---"
    Write-Host "  SKIPPED - no snapshot ID"
    $r16 = @{Step=16; Name="Restore Snapshot"; Status="FAIL"; Notes="No snapshot ID"; Pass=$false; Code="SKIP"; Data=""}
}

Write-Host ""
Write-Host "=============================="
Write-Host "TEST RUN COMPLETE"
Write-Host "=============================="
Write-Host "Project ID: $projectId"
Write-Host "Dimension ID: $dimId"
Write-Host "Member ID: $memberId"
Write-Host "Snapshot ID: $snapshotId"
Write-Host "Baseline ID: $baselineId"
Write-Host "Diff ID: $diffId"

# Summary
$allResults = @($r1, $r2, $r3, $r4, $r5, $r6, $r7, $r8, $r9, $r10, $r11, $r12, $r13, $r14, $r15, $r16)
$passed = ($allResults | Where-Object { $_.Status -eq "PASS" }).Count
$failed = ($allResults | Where-Object { $_.Status -ne "PASS" }).Count
Write-Host ""
Write-Host "PASSED: $passed / 16"
Write-Host "FAILED: $failed / 16"
