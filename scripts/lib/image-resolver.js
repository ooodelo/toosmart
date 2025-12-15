/**
 * Image Resolver Utility
 * Centralized logic for resolving image paths from markdown/HTML content
 *
 * Eliminates code duplication between preprocessMarkdownMedia and rewriteContentMedia
 */

const fs = require('fs');
const path = require('path');
const { getBaseName } = require('./image-processor');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CONTENT_PATH = path.resolve(PROJECT_ROOT, 'content');
const CONTENT_ASSETS_PATH = path.resolve(PROJECT_ROOT, 'dist/assets/content');

/**
 * Check if path is an absolute filesystem path (not web URL)
 * @param {string} filepath
 * @returns {boolean}
 */
function isAbsoluteFilesystemPath(filepath) {
  if (!filepath) return false;

  // Unix-like absolute paths: /Users/..., /home/..., /root/...
  if (filepath.startsWith('/') && !filepath.startsWith('//')) {
    const unixRoots = ['/Users/', '/home/', '/root/', '/var/', '/tmp/', '/opt/'];
    if (unixRoots.some(root => filepath.startsWith(root))) {
      return true;
    }
  }
  // Windows absolute paths: C:\..., D:\...
  if (/^[a-zA-Z]:\\/.test(filepath)) {
    return true;
  }
  return false;
}

/**
 * Check if path should be skipped (external URL, data URL, already processed)
 * @param {string} imagePath
 * @returns {boolean}
 */
function shouldSkipPath(imagePath) {
  if (!imagePath) return true;
  // External URLs
  if (/^(https?:)?\/\//.test(imagePath)) return true;
  // Data URLs
  if (imagePath.startsWith('data:')) return true;
  // Already processed paths
  if (imagePath.startsWith('/assets/content/')) return true;
  return false;
}

/**
 * Resolve image path to absolute filesystem path
 * Handles: absolute paths, project-relative, content-relative, and smart lookup
 *
 * @param {string} imagePath - Original image path from markdown/HTML
 * @param {string} dirPath - Directory of the markdown file containing the image
 * @returns {string|null} - Resolved absolute path or null if not found
 */
function resolveImagePath(imagePath, dirPath) {
  if (!imagePath || shouldSkipPath(imagePath)) {
    return null;
  }

  let resolvedPath = null;

  // Case 1: Absolute filesystem path (e.g., /Users/..., /home/..., C:\\...)
  if (isAbsoluteFilesystemPath(imagePath)) {
    if (fs.existsSync(imagePath)) {
      resolvedPath = imagePath;
    } else {
      console.warn(`⚠️  Image not found: ${imagePath}`);
      return null;
    }
  }
  // Case 2: Project-relative path (e.g., /content/images/...)
  else if (imagePath.startsWith('/content/')) {
    resolvedPath = path.join(PROJECT_ROOT, imagePath.substring(1));
    if (!fs.existsSync(resolvedPath)) {
      console.warn(`⚠️  Image not found: ${resolvedPath}`);
      return null;
    }
  }
  // Case 3: Relative path (e.g., ../images/..., ./images/..., images/...)
  else if (!imagePath.startsWith('/')) {
    resolvedPath = path.resolve(dirPath, imagePath);
  }

  // Smart Lookup: If not found, try to find in content/images/
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    // Check if it's a path starting with /images/ (explicit alias)
    if (imagePath.startsWith('/images/')) {
      const candidate = path.join(CONTENT_PATH, imagePath.substring(1));
      if (fs.existsSync(candidate)) {
        resolvedPath = candidate;
      }
    }

    // Fallback: Check by filename in content/images/
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      const filename = path.basename(imagePath);
      const candidate = path.join(CONTENT_PATH, 'images', filename);
      if (fs.existsSync(candidate)) {
        resolvedPath = candidate;
      }
    }
  }

  // Final check
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    // Only warn for paths that look like they should exist
    if (isAbsoluteFilesystemPath(imagePath) || imagePath.startsWith('/content/') || !imagePath.startsWith('/')) {
      console.warn(`⚠️  Image not found: ${imagePath}`);
    }
    return null;
  }

  return resolvedPath;
}

/**
 * Sanitize filename for safe web usage
 * @param {string} filename
 * @returns {string}
 */
function sanitizeFilename(filename) {
  let sanitized = filename.replace(/\s+/g, '_');
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');
  sanitized = sanitized.replace(/_+/g, '_');
  return sanitized;
}

/**
 * Register an image asset in the registry for later processing
 *
 * @param {string} resolvedPath - Absolute path to source image
 * @param {Map} assetRegistry - Asset registry map
 * @param {string} destDir - Destination directory for processed images
 * @returns {{ baseName: string, webPathBase: string, fallbackExt: string }}
 */
function registerImageAsset(resolvedPath, assetRegistry, destDir = CONTENT_ASSETS_PATH) {
  if (!resolvedPath || !assetRegistry) {
    return null;
  }

  const originalFilename = path.basename(resolvedPath);
  const originalExt = path.extname(originalFilename).toLowerCase();
  const baseName = getBaseName(sanitizeFilename(originalFilename));
  const webPathBase = `/assets/content/${baseName}`;

  // Determine fallback extension: PNG keeps transparency, SVG stays SVG, others become JPEG
  const fallbackExt = originalExt === '.svg' ? '.svg' : (originalExt === '.png' ? '.png' : '.jpg');

  // Register if not already registered
  if (!assetRegistry.has(resolvedPath)) {
    assetRegistry.set(resolvedPath, {
      source: resolvedPath,
      destination: `${baseName}${originalExt}`,
      url: `${webPathBase}${fallbackExt}`,
      destDir: destDir,
      baseName: baseName,
      originalExt: originalExt,
      fallbackExt: fallbackExt
    });
  }

  return {
    baseName,
    webPathBase,
    fallbackExt,
    originalExt
  };
}

/**
 * Process a single image reference from markdown and return new markdown
 *
 * @param {string} fullMatch - Full markdown image syntax match
 * @param {string} altText - Alt text
 * @param {string} imagePath - Image path
 * @param {string} dirPath - Directory of markdown file
 * @param {Map} assetRegistry - Asset registry
 * @returns {string|null} - New markdown string or null if unchanged
 */
function processMarkdownImage(fullMatch, altText, imagePath, dirPath, assetRegistry) {
  if (shouldSkipPath(imagePath)) {
    return null;
  }

  const resolvedPath = resolveImagePath(imagePath, dirPath);
  if (!resolvedPath) {
    return null;
  }

  const assetInfo = registerImageAsset(resolvedPath, assetRegistry);
  if (!assetInfo) {
    return null;
  }

  return `![${altText}](${assetInfo.webPathBase}${assetInfo.fallbackExt})`;
}

module.exports = {
  isAbsoluteFilesystemPath,
  shouldSkipPath,
  resolveImagePath,
  sanitizeFilename,
  registerImageAsset,
  processMarkdownImage,
  PROJECT_ROOT,
  CONTENT_PATH,
  CONTENT_ASSETS_PATH
};
