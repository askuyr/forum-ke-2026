$ErrorActionPreference = "Stop"
$root = "C:\Users\askuyr\Desktop\forum-ke-2026"
$dir = Join-Path $root "fonts"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
$url = "https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap"
$css = (Invoke-WebRequest -Uri $url -Headers @{ "User-Agent" = $ua } -UseBasicParsing).Content
$blocks = [regex]::Matches($css, "/\*\s*([a-z\-]+)\s*\*/\s*@font-face\s*\{([^}]+)\}")
$saved = @()
foreach ($b in $blocks) {
    $subset = $b.Groups[1].Value
    if ($subset -ne "cyrillic" -and $subset -ne "latin") { continue }
    $body = $b.Groups[2].Value
    $fam = [regex]::Match($body, "font-family:\s*'([^']+)'").Groups[1].Value
    $style = [regex]::Match($body, "font-style:\s*([a-z]+)").Groups[1].Value
    $weight = [regex]::Match($body, "font-weight:\s*(\d+)").Groups[1].Value
    $src = [regex]::Match($body, "url\((https://[^)]+)\)").Groups[1].Value
    if (-not $src) { continue }
    $slug = ($fam.ToLower() -replace "[^a-z0-9]+", "-").Trim("-")
    $name = "$slug-$weight-$style-$subset.woff2"
    $target = Join-Path $dir $name
    if (-not (Test-Path $target)) { Invoke-WebRequest -Uri $src -OutFile $target -UseBasicParsing | Out-Null }
    $saved += $name
}
$saved | Sort-Object | ForEach-Object { $_ }
