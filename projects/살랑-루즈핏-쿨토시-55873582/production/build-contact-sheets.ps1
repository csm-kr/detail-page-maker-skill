param(
  [string]$Revision = 'rev001'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$productionRoot = $PSScriptRoot
$projectRoot = Split-Path -Parent $productionRoot
$planPath = Join-Path $productionRoot 'production-plan.json'
$plan = Get-Content -Raw -Encoding utf8 -LiteralPath $planPath | ConvertFrom-Json
$evidenceRoot = Join-Path $projectRoot 'qa\evidence\g2-image-assets'
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null

$cardWidth = 400
$cardHeight = 590
$imageWidth = 368
$imageHeight = 520
$columns = 4
$rows = 2
$sheetWidth = $cardWidth * $columns
$sheetHeight = $cardHeight * $rows

$backgroundBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(237, 235, 228))
$cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(250, 249, 244))
$labelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(16, 39, 31))
$labelTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$sizeTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(217, 233, 226))
$labelFont = New-Object System.Drawing.Font('Arial', 17, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$sizeFont = New-Object System.Drawing.Font('Arial', 14, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

$jpegEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' } |
  Select-Object -First 1
$encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
  [System.Drawing.Imaging.Encoder]::Quality,
  [long]92
)

$outputs = @()

try {
  foreach ($group in @('A', 'B', 'C', 'D', 'E')) {
    $routes = @(
      $plan.assetRouting |
        Where-Object { $_.assetId.StartsWith($group) } |
        Sort-Object assetId
    )
    if ($routes.Count -ne 8) {
      throw "Expected 8 $group assets, got $($routes.Count)"
    }

    $sheet = New-Object System.Drawing.Bitmap($sheetWidth, $sheetHeight)
    $graphics = [System.Drawing.Graphics]::FromImage($sheet)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.FillRectangle($backgroundBrush, 0, 0, $sheetWidth, $sheetHeight)

    try {
      for ($index = 0; $index -lt $routes.Count; $index += 1) {
        $route = $routes[$index]
        $column = $index % $columns
        $row = [math]::Floor($index / $columns)
        $cardX = $column * $cardWidth
        $cardY = $row * $cardHeight
        $graphics.FillRectangle($cardBrush, $cardX, $cardY, $cardWidth, $cardHeight)

        $inputPath = Join-Path $projectRoot ($route.rawPath -replace '/', '\')
        if (-not (Test-Path -LiteralPath $inputPath)) {
          throw "Missing generated image: $($route.rawPath)"
        }

        $image = [System.Drawing.Image]::FromFile($inputPath)
        try {
          $scale = [math]::Min($imageWidth / $image.Width, $imageHeight / $image.Height)
          $drawWidth = [int][math]::Round($image.Width * $scale)
          $drawHeight = [int][math]::Round($image.Height * $scale)
          $drawX = $cardX + 16 + [int][math]::Floor(($imageWidth - $drawWidth) / 2)
          $drawY = $cardY + 12 + [int][math]::Floor(($imageHeight - $drawHeight) / 2)
          $graphics.DrawImage($image, $drawX, $drawY, $drawWidth, $drawHeight)
        }
        finally {
          $image.Dispose()
        }

        $labelY = $cardY + 536
        $graphics.FillRectangle($labelBrush, $cardX, $labelY, $cardWidth, 54)
        $graphics.DrawString($route.assetId, $labelFont, $labelTextBrush, $cardX + 18, $labelY + 16)
        $job = $plan.jobs | Where-Object { $_.jobId -eq $route.jobId } | Select-Object -First 1
        $graphics.DrawString($job.targetSize, $sizeFont, $sizeTextBrush, $cardX + 94, $labelY + 18)
      }

      $outputPath = Join-Path $evidenceRoot "contact-$group-$Revision.jpg"
      $sheet.Save($outputPath, $jpegEncoder, $encoderParameters)
      $outputs += $outputPath.Substring($projectRoot.Length + 1).Replace('\', '/')
    }
    finally {
      $graphics.Dispose()
      $sheet.Dispose()
    }
  }
}
finally {
  $backgroundBrush.Dispose()
  $cardBrush.Dispose()
  $labelBrush.Dispose()
  $labelTextBrush.Dispose()
  $sizeTextBrush.Dispose()
  $labelFont.Dispose()
  $sizeFont.Dispose()
  $encoderParameters.Dispose()
}

[pscustomobject]@{
  ok = $true
  sheets = $outputs.Count
  outputs = $outputs
  dimensions = "${sheetWidth}x${sheetHeight}"
} | ConvertTo-Json -Depth 4
