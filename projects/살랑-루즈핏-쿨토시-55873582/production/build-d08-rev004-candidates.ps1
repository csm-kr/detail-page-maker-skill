$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$productionRoot = $PSScriptRoot
$projectRoot = Split-Path -Parent $productionRoot
$inputRoot = Join-Path $projectRoot 'asset\generated\pending\image\production-rev004-feedback\correction-06-d08-nonoverlap-candidates'
$evidenceRoot = Join-Path $projectRoot 'qa\evidence\g2-image-assets'
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null

$columns = 4
$rows = 2
$cardWidth = 350
$cardHeight = 390
$imageSize = 326
$sheetWidth = $columns * $cardWidth
$sheetHeight = $rows * $cardHeight

$bitmap = New-Object System.Drawing.Bitmap($sheetWidth, $sheetHeight)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$backgroundBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(232, 229, 220))
$cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(251, 249, 243))
$labelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(18, 48, 39))
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font('Arial', 18, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$jpegEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' } |
  Select-Object -First 1
$encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
  [System.Drawing.Imaging.Encoder]::Quality,
  [long]94
)

try {
  $graphics.FillRectangle($backgroundBrush, 0, 0, $sheetWidth, $sheetHeight)
  for ($index = 0; $index -lt 8; $index += 1) {
    $column = $index % $columns
    $row = [math]::Floor($index / $columns)
    $x = $column * $cardWidth
    $y = $row * $cardHeight
    $graphics.FillRectangle($cardBrush, $x, $y, $cardWidth, $cardHeight)

    $inputPath = Join-Path $inputRoot "frame-$($index.ToString('000')).png"
    $image = [System.Drawing.Image]::FromFile($inputPath)
    try {
      $graphics.DrawImage($image, $x + 12, $y + 12, $imageSize, $imageSize)
    }
    finally {
      $image.Dispose()
    }
    $graphics.FillRectangle($labelBrush, $x, $y + 350, $cardWidth, 40)
    $graphics.DrawString(
      "D08 CANDIDATE $($index + 1)  |  frame-$($index.ToString('000'))",
      $font,
      $textBrush,
      $x + 12,
      $y + 361
    )
  }

  $outputPath = Join-Path $evidenceRoot 'd08-rev004-candidates-8up.jpg'
  $bitmap.Save($outputPath, $jpegEncoder, $encoderParameters)
  [pscustomobject]@{
    ok = $true
    output = $outputPath.Substring($projectRoot.Length + 1).Replace('\', '/')
    dimensions = "${sheetWidth}x${sheetHeight}"
  } | ConvertTo-Json
}
finally {
  $graphics.Dispose()
  $bitmap.Dispose()
  $backgroundBrush.Dispose()
  $cardBrush.Dispose()
  $labelBrush.Dispose()
  $textBrush.Dispose()
  $font.Dispose()
  $encoderParameters.Dispose()
}
