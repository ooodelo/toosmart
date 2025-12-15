#!/usr/bin/env node
/**
 * Optimizes CTA icon images for faster loading
 * - Resizes to 256x256 (sufficient for 150px display with retina screens)
 * - Converts to WebP format with 85% quality
 * - Backs up originals as .png.backup
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'src', 'assets');
const TARGET_SIZE = 256;
const WEBP_QUALITY = 85;

const CTA_ICONS = [
  'cloth.png',
  'glove.png',
  'pump_bottle.png',
  'rect_brush.png',
  'round_brush.png',
  'toilet_brush.png',
  'trigger_spray.png'
];

async function optimizeIcon(filename) {
  const inputPath = path.join(ASSETS_DIR, filename);
  const backupPath = inputPath + '.backup';
  const webpFilename = filename.replace('.png', '.webp');
  const outputPath = path.join(ASSETS_DIR, webpFilename);

  try {
    // Get original file size
    const originalStats = fs.statSync(inputPath);
    const originalSizeKB = (originalStats.size / 1024).toFixed(2);

    console.log(`\nProcessing ${filename}...`);
    console.log(`  Original: ${originalSizeKB} KB`);

    // Backup original if not already backed up
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(inputPath, backupPath);
      console.log(`  Backed up to ${path.basename(backupPath)}`);
    }

    // Optimize: resize and convert to WebP
    await sharp(inputPath)
      .resize(TARGET_SIZE, TARGET_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({ quality: WEBP_QUALITY })
      .toFile(outputPath);

    // Get optimized file size
    const optimizedStats = fs.statSync(outputPath);
    const optimizedSizeKB = (optimizedStats.size / 1024).toFixed(2);
    const savedPercent = ((1 - optimizedStats.size / originalStats.size) * 100).toFixed(1);

    console.log(`  Optimized: ${optimizedSizeKB} KB (${webpFilename})`);
    console.log(`  Saved: ${savedPercent}%`);

    return {
      filename,
      originalSize: originalStats.size,
      optimizedSize: optimizedStats.size,
      savedPercent: parseFloat(savedPercent)
    };
  } catch (error) {
    console.error(`  Error processing ${filename}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('=== CTA Icons Optimization ===');
  console.log(`Target size: ${TARGET_SIZE}x${TARGET_SIZE}px`);
  console.log(`WebP quality: ${WEBP_QUALITY}%`);
  console.log(`Processing ${CTA_ICONS.length} icons...\n`);

  const results = [];
  for (const icon of CTA_ICONS) {
    const result = await optimizeIcon(icon);
    if (result) results.push(result);
  }

  // Summary
  const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
  const totalOptimized = results.reduce((sum, r) => sum + r.optimizedSize, 0);
  const totalSaved = ((1 - totalOptimized / totalOriginal) * 100).toFixed(1);

  console.log('\n=== Summary ===');
  console.log(`Total original size: ${(totalOriginal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total optimized size: ${(totalOptimized / 1024).toFixed(2)} KB`);
  console.log(`Total saved: ${totalSaved}%`);
  console.log('\n✓ Optimization complete!');
}

main().catch(console.error);
