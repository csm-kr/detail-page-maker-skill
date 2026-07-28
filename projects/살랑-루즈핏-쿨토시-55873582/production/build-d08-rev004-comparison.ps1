$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$productionRoot = $PSScriptRoot
$projectRoot = Split-Path -Parent $productionRoot
$evidenceRoot = Join-Path $projectRoot 'qa\evidence\g2-image-assets'
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null

$cards = @(
  @{
    Label = 'REAL PRODUCT PAIR'
    Path = 'asset\input\user-real-original\photo-2026-07-27-4605aff2.jpg'
    Color = [System.Drawing.Color]::FromArgb(73, 91, 84)
  },
  @{
    Label = 'D08 v03  REJECTED: OVERLAP'
    Path = 'asset\generated\pending\image\production-rev003-feedback\correction-05-d08\frame-000.png'
    Color = [System.Drawing.Color]::FromArgb(145, 74, 62)
  },
  @{
    Label = 'D08 v04  SELECTED: NO OVERLAP'
    Path = 'asset\generated\pending\image\production-rev004-feedback\correction-06-d08-nonoverlap-candidates\frame-002.png'
    Color = [System.Drawing.Color]::FromArgb(24, 99, 72)
  }
)

$cardWidth = 520
$cardHeight = 590
$gutter = 20
$margin = 30
$headerHeight = 72
$sheetWidth = ($margin * 2) + ($cardWidth * $cards.Count) + ($gutter * ($cards.Count - 1))
$sheetHeight = $margin + $headerHeight + $cardHeight + $margin
$bitmap = New-Object System.Drawing.Bitmap($sheetWidth, $sheetHeight)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$backgroundBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 232, 222))
$titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(25, 43, 36))
$cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(251, 249, 243))
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$titleFont = New-Object System.Drawing.Font('Arial', 28, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$labelFont = New-Object System.Drawing.Font('Arial', 18, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
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
  $graphics.DrawString('D08 NON-OVERLAP SELECTION', $titleFont, $titleBrush, $margin, 26)

  for ($index = 0; $index -lt $cards.Count; $index += 1) {
    $card = $cards[$index]
    $x = $margin + ($index * ($cardWidth + $gutter))
    $y = $margin + $headerHeight
    $graphics.FillRectangle($cardBrush, $x, $y, $cardWidth, $cardHeight)

    $inputPath = Join-Path $projectRoot $card.Path
    $image = [System.Drawing.Image]::FromFile($inputPath)
    try {
      $imageBoxX = $x + 14
      $imageBoxY = $y + 14
      $imageBoxWidth = $cardWidth - 28
      $imageBoxHeight = 508
      $scale = [math]::Min($imageBoxWidth / $image.Width, $imageBoxHeight / $image.Height)
      $drawWidth = [int][math]::Round($image.Width * $scale)
      $drawHeight = [int][math]::Round($image.Height * $scale)
      $drawX = $imageBoxX + [int][math]::Floor(($imageBoxWidth - $drawWidth) / 2)
      $drawY = $imageBoxY + [int][math]::Floor(($imageBoxHeight - $drawHeight) / 2)
      $graphics.DrawImage($image, $drawX, $drawY, $drawWidth, $drawHeight)
    }
    finally {
      $image.Dispose()
    }

    $labelBrush = New-Object System.Drawing.SolidBrush($card.Color)
    try {
      $graphics.FillRectangle($labelBrush, $x, $y + 532, $cardWidth, 58)
      $graphics.DrawString($card.Label, $labelFont, $whiteBrush, $x + 16, $y + 551)
    }
    finally {
      $labelBrush.Dispose()
    }
  }

  $outputPath = Join-Path $evidenceRoot 'd08-rev004-rejected-selected.jpg'
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
  $titleBrush.Dispose()
  $cardBrush.Dispose()
  $whiteBrush.Dispose()
  $titleFont.Dispose()
  $labelFont.Dispose()
  $encoderParameters.Dispose()
}
