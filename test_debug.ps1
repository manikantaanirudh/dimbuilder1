Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
$ErrorActionPreference = "Continue"

Write-Host "=== Testing API connectivity ==="
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8787/api/projects" -Method GET -TimeoutSec 15 -UseBasicParsing
    Write-Host "Status: $($resp.StatusCode)"
    Write-Host "Content: $($resp.Content)"
} catch {
    Write-Host "Exception: $($_.Exception.Message)"
    Write-Host "Inner: $($_.Exception.InnerException)"
    if ($_.Exception.Response) {
        Write-Host "Response Status: $($_.Exception.Response.StatusCode)"
    }
}
