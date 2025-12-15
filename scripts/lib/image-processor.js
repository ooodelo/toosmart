/**
 * Image Processor Utility
 * Generates AVIF, WebP, and fallback formats with transparency preservation
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { optimize } = require('svgo');

// Supported image extensions for processing
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];

// Max width for 2x retina (800px display × 2)
const MAX_WIDTH = 1600;

// Quality settings
const QUALITY = {
    avif: 80,
    webp: 85,
    jpeg: 85,
    png: 9  // compression level 0-9
};

/**
 * Check if image has alpha channel (transparency)
 */
async function hasAlpha(imagePath) {
    try {
        const metadata = await sharp(imagePath).metadata();
        return metadata.hasAlpha === true;
    } catch (error) {
        console.warn(`⚠️  Cannot read metadata for ${imagePath}: ${error.message}`);
        return false;
    }
}

/**
 * Get the base name without extension
 */
function getBaseName(filename) {
    const ext = path.extname(filename);
    return path.basename(filename, ext);
}

/**
 * Process a single image and generate all format variants
 * 
 * @param {string} sourcePath - Absolute path to source image
 * @param {string} destDir - Destination directory
 * @param {string} baseName - Base filename (without extension)
 * @param {Object} options - Processing options
 * @returns {Object} - Paths to generated files and metadata
 */
// Breakpoints for responsive images
const BREAKPOINTS = [400, 800, 1600];

/**
 * Process a single image and generate specific sizes and formats
 * 
 * @param {string} sourcePath - Absolute path to source image
 * @param {string} destDir - Destination directory
 * @param {string} baseName - Base filename (without extension)
 * @param {Object} options - Processing options (maxWidth is ignored in favor of BREAKPOINTS)
 * @returns {Object} - Paths to generated files and metadata
 */
async function processContentImage(sourcePath, destDir, baseName, options = {}) {
    const ext = path.extname(sourcePath).toLowerCase();

    // Skip non-image files
    if (!IMAGE_EXTENSIONS.includes(ext)) {
        // Just copy as-is
        const destPath = path.join(destDir, `${baseName}${ext}`);
        await fs.promises.copyFile(sourcePath, destPath);
        return {
            processed: false,
            original: destPath,
            formats: {} // No responsive formats
        };
    }

    // Handle SVG optimization separately
    if (ext === '.svg') {
        try {
            const svgContent = await fs.promises.readFile(sourcePath, 'utf8');
            const result = optimize(svgContent, {
                path: sourcePath,
                multipass: true,
                plugins: [
                    'preset-default'
                ]
            });

            const destPath = path.join(destDir, `${baseName}.svg`);
            await fs.promises.writeFile(destPath, result.data || svgContent);

            return {
                processed: true,
                isSvg: true,
                original: destPath,
                targetWidth: 'vector',
                formats: {}
            };
        } catch (error) {
            console.error(`❌ Error optimizing SVG ${sourcePath}:`, error.message);
            const destPath = path.join(destDir, `${baseName}.svg`);
            await fs.promises.copyFile(sourcePath, destPath);
            return {
                processed: false,
                error: error.message,
                original: destPath,
                formats: {}
            };
        }
    }

    try {
        const metadata = await sharp(sourcePath).metadata();
        const imageHasAlpha = metadata.hasAlpha === true;
        const width = metadata.width;

        // Determine original format extension for fallback
        const fallbackExt = imageHasAlpha ? '.png' : (ext === '.png' ? '.png' : '.jpg');

        const results = {
            processed: true,
            isSvg: false,
            originalWidth: width,
            hasAlpha: imageHasAlpha,
            fallbackExt: fallbackExt,
            // Structure: { '400': { avif: '...', webp: '...', fallback: '...' }, '800': ... }
            variants: {},
            // Main fallback (largest generated or original if small)
            original: null
        };

        // Determine sizes to generate
        // Generate all breakpoints that are smaller or equal to original width
        // PLUS one step larger? No, don't upscale.
        // Always include the original size if it doesn't match a breakpoint exactly?
        // Simplified strategy: Generate breakpoints <= original width. 
        // If original width > max breakpoint (1600), generate 1600 as max.
        // If original width < min breakpoint (400), generate only original size.

        let widthsToGenerate = BREAKPOINTS.filter(w => w <= width);

        // If image is larger than max breakpoint, ensure max breakpoint is included (already done by filter if width >= 1600)
        // If image is smaller than smallest breakpoint, we should strictly just keep original size?
        // Or should we process it to AVIF/WebP anyway at original size? YES.

        if (widthsToGenerate.length === 0) {
            widthsToGenerate = [width]; // Just process at original size
        } else {
            // If the largest breakpoint is significantly smaller than original, should we clamp to 1600?
            // Yes, we decided MAX_WIDTH = 1600. So we effectively clamp.
            // If image is 2000, widthsToGenerate will be [400, 800, 1600]. Correct.
            // If image is 1000, widthsToGenerate will be [400, 800].
            // We probably also want the 1000 version? Usually "closest breakpoint" is fine.
            // Let's stick to breakpoints for standardization.
            // EXCEPT if the largest breakpoint is much smaller than original? 
            // User logic: "max width 1600". So if 2000, 1600 is fine.
            // If 1000: [400, 800] -> max is 800. We lose 200px?
            // Let's add the original width if it's not in breakpoints and < 1600?
            // To cover the "1000px" case.
            if (width < 1600 && !widthsToGenerate.includes(width)) {
                widthsToGenerate.push(width);
            }
        }

        // Sort widths unique
        widthsToGenerate = [...new Set(widthsToGenerate)].sort((a, b) => a - b);

        // Create pipeline
        const pipeline = sharp(sourcePath);

        for (const w of widthsToGenerate) {
            // Use suffix only if we have multiple sizes OR if it's modified
            // Actually, standardized suffixes like -400w are easier for frontend.
            // If only 1 size (original), maybe no suffix?
            // Let's ALWAYS use suffixes for generated responsive files to avoid collision with original filename if copied.
            // EXCEPT for the "main" fallback which might need to match original name?
            // No, we are post-processing.

            const suffix = `-${w}w`;

            // 1. AVIF
            const avifPath = path.join(destDir, `${baseName}${suffix}.avif`);
            await pipeline.clone()
                .resize(w, null, { withoutEnlargement: true })
                .avif({ quality: QUALITY.avif })
                .toFile(avifPath);

            // 2. WebP
            const webpPath = path.join(destDir, `${baseName}${suffix}.webp`);
            await pipeline.clone()
                .resize(w, null, { withoutEnlargement: true })
                .webp({ quality: QUALITY.webp })
                .toFile(webpPath);

            // 3. Fallback
            const fallbackPath = path.join(destDir, `${baseName}${suffix}${fallbackExt}`);
            const fallbackClone = pipeline.clone().resize(w, null, { withoutEnlargement: true });

            if (imageHasAlpha) {
                await fallbackClone.png({ compressionLevel: QUALITY.png }).toFile(fallbackPath);
            } else {
                await fallbackClone.jpeg({ quality: QUALITY.jpeg, mozjpeg: true }).toFile(fallbackPath);
            }

            results.variants[w] = {
                avif: avifPath,
                webp: webpPath,
                fallback: fallbackPath
            };
        }

        // Determine which one is "default" (largest)
        const largestWidth = widthsToGenerate[widthsToGenerate.length - 1];
        results.original = results.variants[largestWidth].fallback;
        results.formats = results.variants[largestWidth]; // Legacy support for single-format code
        results.breakpoints = widthsToGenerate;

        // Create copy of largest fallback as "baseName.ext" for backward compatibility if needed?
        // Usually build.js rewriting will handle src.

        return results;
    } catch (error) {
        console.error(`❌ Error processing image ${sourcePath}: ${error.message}`);
        // Fallback: just copy
        const destPath = path.join(destDir, `${baseName}${ext}`);
        await fs.promises.copyFile(sourcePath, destPath);
        return {
            processed: false,
            error: error.message,
            original: destPath,
            formats: {} // Empty
        };
    }
}

/**
 * Build <picture> element HTML for an image
 * 
 * @param {string} webPath - Base web path without extension (e.g., /assets/content/image)
 * @param {string} fallbackExt - Extension for fallback (.png or .jpg)
 * @param {string} alt - Alt text
 * @param {Object} attrs - Additional attributes (class, id, etc.)
 * @returns {string} - HTML string
 */
function buildPictureElement(webPath, fallbackExt, alt, attrs = {}) {
    const attrsStr = Object.entries(attrs)
        .filter(([key]) => key !== 'src' && key !== 'alt')
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');

    const attrsPart = attrsStr ? ` ${attrsStr}` : '';

    return `<picture>
  <source srcset="${webPath}.avif" type="image/avif">
  <source srcset="${webPath}.webp" type="image/webp">
  <img src="${webPath}${fallbackExt}" alt="${alt}"${attrsPart}>
</picture>`;
}

module.exports = {
    processContentImage,
    buildPictureElement,
    hasAlpha,
    getBaseName,
    IMAGE_EXTENSIONS,
    MAX_WIDTH,
    QUALITY
};
