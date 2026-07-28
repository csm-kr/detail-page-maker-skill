param(
  [string]$OutputName = 'rev002-new-only-preview.jpg'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $projectRoot 'qa\evidence\g2-image-assets'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

$assets = @(
  @{ Id = 'A01'; Path = 'asset\generated\pending\image\production-rev002-feedback\correction-02-landscape\frame-000.png' },
  @{ Id = 'A03'; Path = 'asset\generated\pending\image\production-rev002-feedback\correction-04-a03\frame-000.png' },
  @{ Id = 'D01'; Path = 'asset\generated\pending\image\production-rev002-feedback\correction-02-landscape\frame-002.png' },
  @{ Id = 'E07'; Path = 'asset\generated\pending\image\production-rev002-feedback\correction-02-landscape\frame-003.png' },
  @{ Id = 'A04'; Path = 'asset\generated\pending\image\production-rev002-feedback\correction-02-square\frame-000.png' },
  @{ Id = 'D08'; Path = 'asset\generated\pending\image\production-rev002-feedback\correction-02-square\frame-001.png' },
  @{ Id = 'E08'; Path = 'asset\generated\pending\image\production-rev002-feedback\correction-02-square\frame-002.png' }
)

$cardWidth = 480
$cardHeight = 400
$imageWidth = 448
$imageHeight = 330
$columns = 4
$rows = 2
$sheetWidth = $cardWidth * $columns
$sheetHeight = $cardHeight * $rows

$backgroundBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(237, 235, 228))
$cardBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(250, 249, 244))
$labelBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(16, 39, 31))
$textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
$font = [System.Drawing.Font]::new('Arial', 18, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$jpegEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' } |
  Select-Object -First 1
$encoderParameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
$encoderParameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
  [System.Drawing.Imaging.Encoder]::Quality,
  [long]94
)

$sheet = [System.Drawing.Bitmap]::new($sheetWidth, $sheetHeight)
$graphics = [System.Drawing.Graphics]::FromImage($sheet)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.FillRectangle($backgroundBrush, 0, 0, $sheetWidth, $sheetHeight)

try {
  for ($index = 0; $index -lt $assets.Count; $index += 1) {
    $asset = $assets[$index]
    $column = $index % $columns
    $row = [math]::Floor($index / $columns)
    $cardX = $column * $cardWidth
    $cardY = $row * $cardHeight
    $graphics.FillRectangle($cardBrush, $cardX, $cardY, $cardWidth, $cardHeight)

    $inputPath = Join-Path $projectRoot $asset.Path
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

    $labelY = $cardY + 346
    $graphics.FillRectangle($labelBrush, $cardX, $labelY, $cardWidth, 54)
    $graphics.DrawString("$($asset.Id) revised", $font, $textBrush, $cardX + 18, $labelY + 16)
  }

  $outputPath = Join-Path $outputRoot $OutputName
  $sheet.Save($outputPath, $jpegEncoder, $encoderParameters)
  [pscustomobject]@{
    ok = $true
    path = $outputPath.Substring($projectRoot.Length + 1).Replace('\', '/')
    dimensions = "${sheetWidth}x${sheetHeight}"
  } | ConvertTo-Json
}
finally {
  $graphics.Dispose()
  $sheet.Dispose()
  $backgroundBrush.Dispose()
  $cardBrush.Dispose()
  $labelBrush.Dispose()
  $textBrush.Dispose()
  $font.Dispose()
  $encoderParameters.Dispose()
}
