# Create icons directory if it doesn't exist
$iconsDir = Join-Path $PSScriptRoot "icons"
if (!(Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null
}

Add-Type -AssemblyName System.Drawing

function Generate-Icon ($size, $filename) {
    # Create bitmap
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    
    # Set drawing quality options
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)
    
    # Draw Shield background (nice deep blue block)
    $shieldColor = [System.Drawing.Color]::FromArgb(26, 115, 232) # Blue color #1a73e8
    $brush = New-Object System.Drawing.SolidBrush($shieldColor)
    
    # Coordinates for drawing
    $padding = $size * 0.1
    $w = $size - (2 * $padding)
    
    # Draw a clean rounded rect/shield style
    $rect = New-Object System.Drawing.RectangleF($padding, $padding, $w, $w)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    
    # Create rounded shield path
    $r = $size * 0.15
    $path.AddArc($rect.X, $rect.Y, $r, $r, 180, 90)
    $path.AddArc($rect.Right - $r, $rect.Y, $r, $r, 270, 90)
    $path.AddArc($rect.Right - $r, $rect.Bottom - $r, $r, $r, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $r, $r, $r, 90, 90)
    $path.CloseAllFigures()
    
    $g.FillPath($brush, $path)
    
    # Draw Inner block symbol (a small white click-crosshair or diagonal cancel line)
    $penColor = [System.Drawing.Color]::White
    $penWidth = [Math]::Max(1.0, ($size * 0.08))
    $pen = New-Object System.Drawing.Pen($penColor, $penWidth)
    
    $center = $size / 2
    $innerOffset = $size * 0.22
    
    # Draw block circle
    $innerR = $size * 0.36
    $innerX = $center - ($innerR / 2)
    $innerY = $center - ($innerR / 2)
    $g.DrawEllipse($pen, $innerX, $innerY, $innerR, $innerR)
    
    # Draw diagonal cancel line
    $lineOffset = ($innerR / 2) * 0.707
    $g.DrawLine($pen, ($center - $lineOffset), ($center - $lineOffset), ($center + $lineOffset), ($center + $lineOffset))
    
    # Save image
    $filePath = Join-Path $iconsDir $filename
    $bmp.Save($filePath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # Clean up
    $pen.Dispose()
    $brush.Dispose()
    $path.Dispose()
    $g.Dispose()
    $bmp.Dispose()
    
    Write-Host "Generated: $filename ($size x $size)"
}

Generate-Icon 16 "icon-16.png"
Generate-Icon 32 "icon-32.png"
Generate-Icon 48 "icon-48.png"
Generate-Icon 128 "icon-128.png"

Write-Host "Icons generation completed successfully!"
