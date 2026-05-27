Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

$projectId = "cfuovSAxst2eTZGEvoniS"
$dimId = "b-LxXoftnoLjxm4uj-mX4"
$memberId = "9FI-7CPmBTM6Teu2fQD6N"
$baselineId = "-fqTJ1nPvDYLWFC12bwjN"

Write-Host "=== Test: POST /api/projects/{id}/diff with baselineId ==="
try {
    $body = "{`"baselineId`":`"$baselineId`"}"
    Write-Host "Body: $body"
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8787/api/projects/$projectId/diff" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 30 -UseBasicParsing
    Write-Host "Status: $($resp.StatusCode)"
    Write-Host "Content: $($resp.Content)"
} catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "NO_RESP" }
    Write-Host "Error: $code - $($_.Exception.Message)"
    if ($_.Exception.Response) {
        try {
            $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            Write-Host "Body: $($sr.ReadToEnd())"
            $sr.Close()
        } catch {}
    }
}

Write-Host ""
Write-Host "=== Get member details first ==="
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8787/api/projects/$projectId/dimensions/$dimId/members" -Method GET -TimeoutSec 15 -UseBasicParsing
    $data = $resp.Content | ConvertFrom-Json
    if ($data.rows) {
        foreach ($m in $data.rows) {
            if ($m.id -eq $memberId) {
                Write-Host "Found member: $($m | ConvertTo-Json -Depth 5)"
            }
        }
    }
} catch {
    Write-Host "Error getting members: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=== Test: PATCH member with full body (adding memberKey) ==="
try {
    $body = '{"memberKey":"TEST_MEMBER_01","description":"Modified for diff test","properties":{}}'
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8787/api/projects/$projectId/members/$memberId" -Method PATCH -ContentType "application/json" -Body $body -TimeoutSec 15 -UseBasicParsing
    Write-Host "Status: $($resp.StatusCode)"
    Write-Host "Content: $($resp.Content)"
} catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "NO_RESP" }
    Write-Host "Error: $code - $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=== Test: PUT /api/projects/{id}/members/{memberId} ==="
try {
    $body = '{"description":"Modified for diff test"}'
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8787/api/projects/$projectId/members/$memberId" -Method PUT -ContentType "application/json" -Body $body -TimeoutSec 15 -UseBasicParsing
    Write-Host "Status: $($resp.StatusCode)"
    Write-Host "Content: $($resp.Content)"
} catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "NO_RESP" }
    Write-Host "Error: $code - $($_.Exception.Message)"
}
