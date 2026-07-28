param(
  [string]$OutputName = 'rev002-original-rejected-revised.jpg'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $projectRoot 'qa\evidence\g2-image-assets'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

$rows = @(
  @{
    Id = 'A01'
    Original = 'asset\input\user-real-original\photo-2026-07-27-4605aff2.jpg'
    Rejected = 'asset\generated\pending\image\production-rev001\landscape-1536x1024-01\frame-000.png'
    Revised = 'asset\generated\pending\image\production-rev002-feedback\correction-02-landscape\frame-000.png'
  },
  @{
    Id = 'A03'
    Original = 'asset\input\user-real-original\photo-2026-07-05-d63f66f5.jpg'
    Rejected = 'asset\generated\pending\image\production-rev001\landscape-1536x1024-01\frame-001.png'
    Revised = 'asset\generated\pending\image\production-rev002-feedback\correction-04-a03\frame-000.png'
  },
  @{
    Id = 'A04'
    Original = 'asset\input\user-real-original\photo-2026-07-27-fd874f53.jpg'
    Rejected = 'asset\generated\pending\image\production-rev001\square-1024x1024-01\frame-000.png'
    Revised = 'asset\generated\pending\image\production-rev002-feedback\correction-02-square\frame-000.png'
  },
  @{
    Id = 'D01'
    Original = 'asset\input\user-real-original\photo-2026-07-27-4605aff2.jpg'
    Rejected = 'asset\generated\pending\image\production-rev001\landscape-1536x1024-01\frame-002.png'
    Revised = 'asset\generated\pending\image\production-rev002-feedback\correction-02-landscape\frame-002.png'
  },
  @{
    Id = 'D08'
    Original = 'asset\input\user-real-original\photo-2026-07-27-4605aff2.jpg'
    Rejected = 'asset\generated\pending\image\production-rev001\square-1024x1024-02\frame-001.png'
    Revised = 'asset\generated\pending\image\production-rev002-feedback\correction-02-square\frame-001.png'
  },
  @{
    Id = 'E07'
    Original = 'asset\input\user-real-original\photo-2026-07-27-4605aff2.jpg'
    Rejected = 'asset\generated\pending\image\production-rev001\landscape-1536x1024-01\frame-003.png'
    Revised = 'asset\generated\pending\image\production-rev002-feedback\correction-02-landscape\frame-003.png'
  },
  @{
    Id = 'E08'
    Original = 'asset\input\user-real-original\photo-2026-07-14-0bd7c853.jpg'
    Rejected = 'asset\generated\pending\image\production-rev001-corrections\correction-01\frame-002.png'
    Revised = 'asset\generated\pending\image\production-rev002-feedback\correction-02-square\frame-002.png'
  }
)

$columnWidth = 500
$rowHeight = 390
$headerHeight = 70
$sheetWidth = $columnWidth * 3
$sheetHeight = $headerHeight + ($rowHeight * $rows.Count)
$imageWidth = 468
$imageHeight = 300

$backgroundBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(237, 235, 228))
$cardBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(250, 249, 244))
$headerBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(16, 39, 31))
$whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
$darkBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(16, 39, 31))
$mutedBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(88, 104, 97))
$headerFont = [System.Drawing.Font]::new('Arial', 22, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$idFont = [System.Drawing.Font]::new('Arial', 20, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$statusFont = [System.Drawing.Font]::new('Arial', 16, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
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
  $headers = @('REAL SSOT', 'REJECTED', 'REVISED')
  for ($column = 0; $column -lt 3; $column += 1) {
    $x = $column * $columnWidth
    $graphics.FillRectangle($headerBrush, $x, 0, $columnWidth, $headerHeight)
    $graphics.DrawString($headers[$column], $headerFont, $whiteBrush, $x + 20, 20)
  }

  for ($rowIndex = 0; $rowIndex -lt $rows.Count; $rowIndex += 1) {
    $row = $rows[$rowIndex]
    $y = $headerHeight + ($rowIndex * $rowHeight)
    $paths = @($row.Original, $row.Rejected, $row.Revised)

    for ($column = 0; $column -lt 3; $column += 1) {
      $x = $column * $columnWidth
      $graphics.FillRectangle($cardBrush, $x + 2, $y + 2, $columnWidth - 4, $rowHeight - 4)
      $inputPath = Join-Path $projectRoot $paths[$column]
      $image = [System.Drawing.Image]::FromFile($inputPath)
      try {
        $scale = [math]::Min($imageWidth / $image.Width, $imageHeight / $image.Height)
        $drawWidth = [int][math]::Round($image.Width * $scale)
        $drawHeight = [int][math]::Round($image.Height * $scale)
        $drawX = $x + 16 + [int][math]::Floor(($imageWidth - $drawWidth) / 2)
        $drawY = $y + 18 + [int][math]::Floor(($imageHeight - $drawHeight) / 2)
        $graphics.DrawImage($image, $drawX, $drawY, $drawWidth, $drawHeight)
      }
      finally {
        $image.Dispose()
      }

      $graphics.DrawString($row.Id, $idFont, $darkBrush, $x + 18, $y + 334)
      $status = if ($column -eq 0) { 'real product reference' } elseif ($column -eq 1) { 'length / identity rejected' } else { '47:14 ratio revised' }
      $graphics.DrawString($status, $statusFont, $mutedBrush, $x + 78, $y + 336)
    }
  }

  $outputPath = Join-Path $outputRoot $OutputName
  $sheet.Save($outputPath, $jpegEncoder, $encoderParameters)
  [pscustomobject]@{
    ok = $true
    path = $outputPath.Substring($projectRoot.Length + 1).Replace('\', '/')
    dimensions = "${sheetWidth}x${sheetHeight}"
    rows = $rows.Count
  } | ConvertTo-Json
}
finally {
  $graphics.Dispose()
  $sheet.Dispose()
  $backgroundBrush.Dispose()
  $cardBrush.Dispose()
  $headerBrush.Dispose()
  $whiteBrush.Dispose()
  $darkBrush.Dispose()
  $mutedBrush.Dispose()
  $headerFont.Dispose()
  $idFont.Dispose()
  $statusFont.Dispose()
  $encoderParameters.Dispose()
}
