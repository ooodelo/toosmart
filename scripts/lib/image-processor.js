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
async function processContentImage(sourcePath, destDir, baseName, options = {}) {
    const ext = path.extname(sourcePath).toLowerCase();
    const maxWidth = options.maxWidth || MAX_WIDTH;

    // Skip non-image files
    if (!IMAGE_EXTENSIONS.includes(ext)) {
        // Just copy as-is
        const destPath = path.join(destDir, `${baseName}${ext}`);
        await fs.promises.copyFile(sourcePath, destPath);
        return {
            processed: false,
            original: destPath,
            formats: {}
        };
    }

    // Handle SVG optimization separately
    if (ext === '.svg') {
        try {
            const svgContent = await fs.promises.readFile(sourcePath, 'utf8');
            const result = optimize(svgContent, {
                path: sourcePath,
                multipass: true, // Enable multipass optimization
                plugins: [
                    'preset-default',
                    'removeDimensions', // Remove width/height attributes (optional, good for responsive)
                    'removeXMLNS'
                ]
            });

            const destPath = path.join(destDir, `${baseName}.svg`);
            await fs.promises.writeFile(destPath, result.data || svgContent); // Fallback to original if optimization failed (empty result)

            return {
                processed: true,
                isSvg: true, // Marker for build script
                original: destPath,
                targetWidth: 'vector',
                formats: {} // No raster formats for SVG
            };
        } catch (error) {
            console.error(`❌ Error optimizing SVG ${sourcePath}:`, error.message);
            // Fallback: just copy
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
        const originalExt = ext;

        // Determine original format extension for fallback
        const fallbackExt = imageHasAlpha ? '.png' : (ext === '.png' ? '.png' : '.jpg');

        // Calculate target dimensions (resize only if larger than max)
        const needsResize = metadata.width > maxWidth;
        const targetWidth = needsResize ? maxWidth : metadata.width;

        // Create sharp pipeline
        let pipeline = sharp(sourcePath);

        if (needsResize) {
            pipeline = pipeline.resize(targetWidth, null, {
                kernel: 'lanczos3',
                withoutEnlargement: true
            });
        }

        const results = {
            processed: true,
            originalWidth: metadata.width,
            targetWidth: targetWidth,
            hasAlpha: imageHasAlpha,
            formats: {}
        };

        // 1. Generate AVIF
        const avifPath = path.join(destDir, `${baseName}.avif`);
        await pipeline.clone()
            .avif({ quality: QUALITY.avif })
            .toFile(avifPath);
        results.formats.avif = avifPath;

        // 2. Generate WebP (preserves alpha)
        const webpPath = path.join(destDir, `${baseName}.webp`);
        await pipeline.clone()
            .webp({ quality: QUALITY.webp })
            .toFile(webpPath);
        results.formats.webp = webpPath;

        // 3. Generate fallback (PNG for transparent, JPEG for opaque)
        const fallbackPath = path.join(destDir, `${baseName}${fallbackExt}`);
        if (imageHasAlpha) {
            await pipeline.clone()
                .png({ compressionLevel: QUALITY.png })
                .toFile(fallbackPath);
        } else {
            await pipeline.clone()
                .jpeg({ quality: QUALITY.jpeg, mozjpeg: true })
                .toFile(fallbackPath);
        }
        results.formats.fallback = fallbackPath;
        results.fallbackExt = fallbackExt;
        results.original = fallbackPath;

        return results;
    } catch (error) {
        console.error(`❌ Error processing image ${sourcePath}: ${error.message}`);

        // Fallback: just copy the original
        const destPath = path.join(destDir, `${baseName}${ext}`);
        await fs.promises.copyFile(sourcePath, destPath);
        return {
            processed: false,
            error: error.message,
            original: destPath,
            formats: {}
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
