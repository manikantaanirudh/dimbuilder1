Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# Debug step 9: Edit Member
Write-Host "=== Testing PATCH /api/projects/{id}/members/{memberId} ==="
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8787/api/projects/cfuovSAxst2eTZGEvoniS/members/9FI-7CPmBTM6Teu2fQD6N" -Method PATCH -ContentType "application/json" -Body '{"description":"Modified for diff test"}' -TimeoutSec 15 -UseBasicParsing
    Write-Host "Status: $($resp.StatusCode)"
    Write-Host "Content: $($resp.Content)"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        Write-Host "HTTP Status: $([int]$_.Exception.Response.StatusCode)"
        try {
            $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $body = $sr.ReadToEnd()
            $sr.Close()
            Write-Host "Response body: $body"
        } catch {
            Write-Host "Could not read response body"
        }
    }
}

Write-Host ""
Write-Host "=== Testing diff endpoint discovery ==="
# Check what routes exist for baselines/diff
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8787/api/projects/cfuovSAxst2eTZGEvoniS/baselines/-fqTJ1nPvDYLWFC12bwjN/diff" -Method POST -ContentType "application/json" -Body '{}' -TimeoutSec 15 -UseBasicParsing
    Write-Host "Status: $($resp.StatusCode)"
    Write-Host "Content: $($resp.Content)"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        Write-Host "HTTP Status: $([int]$_.Exception.Response.StatusCode)"
        try {
            $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $body = $sr.ReadToEnd()
            $sr.Close()
            Write-Host "Response body: $body"
        } catch {
            Write-Host "Could not read response body"
        }
    }
}

Write-Host ""
Write-Host "=== Checking available routes for diff ==="
# Try alternative diff endpoint patterns
$endpoints = @(
    "http://127.0.0.1:8787/api/projects/cfuovSAxst2eTZGEvoniS/diff",
    "http://127.0.0.1:8787/api/projects/cfuovSAxst2eTZGEvoniS/diffs",
    "http://127.0.0.1:8787/api/diff/cfuovSAxst2eTZGEvoniS"
)
foreach ($ep in $endpoints) {
    try {
        $resp = Invoke-WebRequest -Uri $ep -Method POST -ContentType "application/json" -Body '{"baselineId":"-fqTJ1nPvDYLWFC12bwjN"}' -TimeoutSec 10 -UseBasicParsing
        Write-Host "$ep -> $($resp.StatusCode)"
    } catch {
        $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "NO_RESP" }
        Write-Host "$ep -> $code"
    }
}

Write-Host ""
Write-Host "=== Testing PATCH on dimension member endpoint instead ==="
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8787/api/projects/cfuovSAxst2eTZGEvoniS/dimensions/b-LxXoftnoLjxm4uj-mX4/members/9FI-7CPmBTM6Teu2fQD6N" -Method PATCH -ContentType "application/json" -Body '{"description":"Modified for diff test"}' -TimeoutSec 15 -UseBasicParsing
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
Write-Host "=== Testing PUT on dimension member ==="
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8787/api/projects/cfuovSAxst2eTZGEvoniS/dimensions/b-LxXoftnoLjxm4uj-mX4/members/9FI-7CPmBTM6Teu2fQD6N" -Method PUT -ContentType "application/json" -Body '{"description":"Modified for diff test"}' -TimeoutSec 15 -UseBasicParsing
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
