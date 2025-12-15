/**
 * Paywall Module - Refactored
 * 
 * Архитектура:
 * 1. parseEnhancedMarkdown() — единственная точка рендера markdown → HTML
 * 2. Разбиваем HTML на блоки и уже по ним режем открытую/тизер/закрытую части
 * 3. Если есть <!-- divider --> — граница ставится по нему, divider остаётся в открытой части
 */

const { parseEnhancedMarkdown, extractMeta } = require('./enhanced-markdown-parser');

const DEFAULT_TEASER_BLOCKS = 4;

/**
 * Strip HTML tags to get plain text
 */
function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if an HTML block is a divider
 */
function isDividerBlock(html) {
  return /<div[^>]+class="[^"]*article-divider[^"]*"/i.test(html);
}

/**
 * Check if an HTML block is non-countable (dividers, section labels, breadcrumbs)
 */
function isNonCountableBlock(html) {
  const trimmed = html.trim();
  if (!trimmed) return true;
  if (/<div[^>]+class="[^"]*article-divider[^"]*"/i.test(trimmed)) return true;
  if (/<div[^>]+class="[^"]*section-label[^"]*"/i.test(trimmed)) return true;
  if (/<nav[^>]+class="[^"]*article-breadcrumb[^"]*"/i.test(trimmed)) return true;
  return false;
}

/**
 * Extract blocks from rendered HTML
 * Splits HTML by top-level block elements (p, h1-h6, div, blockquote, ul, ol, etc.)
 * Returns array of { html, isCountable, isDivider }
 * 
 * IMPORTANT: Uses iterative parsing to correctly handle nested elements
 */
function extractHtmlBlocks(html) {
  const blocks = [];
  const blockTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'blockquote', 'ul', 'ol', 'section', 'article', 'header', 'footer', 'nav', 'table', 'pre'];

  // Create pattern for opening tags
  const openTagPattern = new RegExp(`<(${blockTags.join('|')})(\\s[^>]*)?>`, 'gi');

  let lastIndex = 0;
  let match;

  while ((match = openTagPattern.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    const startPos = match.index;

    // Find the corresponding closing tag, handling nesting
    let depth = 1;
    let pos = match.index + match[0].length;

    const closeTagRegex = new RegExp(`<(/?)${tagName}(\\s[^>]*)?>`, 'gi');
    closeTagRegex.lastIndex = pos;

    let closeMatch;
    while (depth > 0 && (closeMatch = closeTagRegex.exec(html)) !== null) {
      if (closeMatch[1] === '/') {
        depth--;
      } else {
        depth++;
      }
    }

    if (depth === 0 && closeMatch) {
      const endPos = closeMatch.index + closeMatch[0].length;
      const blockHtml = html.substring(startPos, endPos).trim();

      if (blockHtml) {
        blocks.push({
          html: blockHtml,
          isCountable: !isNonCountableBlock(blockHtml),
          isDivider: isDividerBlock(blockHtml)
        });
      }

      // Skip past this block for the next iteration
      openTagPattern.lastIndex = endPos;
    }
  }

  return blocks;
}

/**
 * Split HTML blocks into open/teaser/locked segments
 */
function splitHtmlBlocks(blocks, openBlockCount, teaserBlockCount = DEFAULT_TEASER_BLOCKS) {
  const openBlocks = [];
  const teaserBlocks = [];
  const lockedBlocks = [];

  let countableIndex = 0;

  for (const block of blocks) {
    if (block.isCountable) {
      countableIndex++;
    }

    if (countableIndex <= openBlockCount) {
      openBlocks.push(block);
    } else if (countableIndex <= openBlockCount + teaserBlockCount) {
      teaserBlocks.push(block);
    } else {
      lockedBlocks.push(block);
    }
  }

  return {
    openBlocks,
    teaserBlocks,
    lockedBlocks,
    openCount: openBlocks.filter(b => b.isCountable).length,
    teaserCount: teaserBlocks.filter(b => b.isCountable).length,
    totalCount: blocks.filter(b => b.isCountable).length
  };
}

/**
 * Find the first divider and split there
 * Divider остаётся в открытой части
 */
function splitAtFirstDivider(blocks, teaserBlockCount = DEFAULT_TEASER_BLOCKS) {
  const dividerIndex = blocks.findIndex(b => b.isDivider);

  if (dividerIndex === -1) {
    // Нет divider — fallback: 20% контента в открытую, без тизера
    const totalCountable = blocks.filter(b => b.isCountable).length;
    const targetOpen = totalCountable > 0
      ? Math.min(Math.max(1, Math.floor(totalCountable * 0.2)), Math.max(totalCountable - 1, 1))
      : 0;
    return splitHtmlBlocks(blocks, targetOpen, 0);
  }

  const openBlocks = blocks.slice(0, dividerIndex + 1); // divider включён
  const remaining = blocks.slice(dividerIndex + 1);

  const teaserBlocks = [];
  let teaserCountable = 0;
  for (const block of remaining) {
    if (block.isCountable) {
      teaserCountable++;
      if (teaserCountable > teaserBlockCount) break;
    }
    teaserBlocks.push(block);
  }

  const lockedBlocks = remaining.slice(teaserBlocks.length);

  return {
    openBlocks,
    teaserBlocks,
    lockedBlocks,
    openCount: openBlocks.filter(b => b.isCountable).length,
    teaserCount: teaserBlocks.filter(b => b.isCountable).length,
    totalCount: blocks.filter(b => b.isCountable).length
  };
}

/**
 * Build paywall segments from markdown
 * Main entry point for paywall processing
 */
function buildPaywallSegments(markdown, override) {
  if (!markdown || typeof markdown !== 'string') {
    return { openHtml: '', teaserHtml: '', openBlocks: 0, teaserBlocks: 0, totalBlocks: 0, lockedBlocks: [] };
  }

  const { cleanedMarkdown } = extractMeta(markdown);

  // 1) Если в meta задан openBlocks/teaserBlocks — приоритетно, даже если есть divider
  if (override && typeof override.openBlocks === 'number') {
    const fullHtml = parseEnhancedMarkdown(markdown);
    const blocks = extractHtmlBlocks(fullHtml);
    const teaserCount = override.teaserBlocks ?? DEFAULT_TEASER_BLOCKS;
    const split = splitHtmlBlocks(blocks, override.openBlocks, teaserCount);

    return {
      openHtml: split.openBlocks.map(b => b.html).join('\n'),
      teaserHtml: split.teaserBlocks.map(b => b.html).join('\n'),
      openBlocks: split.openCount,
      teaserBlocks: split.teaserCount,
      totalBlocks: split.totalCount,
      lockedBlocks: split.lockedBlocks.map(b => b.html)
    };
  }

  // 2) Есть явный <!-- divider --> — режем по нему ДО рендера HTML
  const dividerRegex = /<!--\s*divider\s*-->/i;
  if (dividerRegex.test(markdown)) {
    const parts = markdown.split(dividerRegex);
    const openMd = (parts[0] || '') + '\n\n<!-- divider -->\n'; // divider в открытую часть
    const lockedMd = parts.slice(1).join('<!-- divider -->');

    const { blocks: openBlockList } = extractBlocksWithMarkers(openMd);
    const openHtml = openBlockList.map(b => b.html).join('\n');
    const openCount = openBlockList.length;

    const { blocks: lockedBlockList } = extractBlocksWithMarkers(lockedMd);
    const teaserLimit = DEFAULT_TEASER_BLOCKS;

    const teaserBlocks = [];
    const lockedBlocks = [];
    let teaserAdded = 0;
    for (const block of lockedBlockList) {
      if (teaserAdded < teaserLimit) {
        teaserBlocks.push(block.html);
        teaserAdded++;
      } else {
        lockedBlocks.push(block.html);
      }
    }

    return {
      openHtml,
      teaserHtml: teaserBlocks.join('\n'),
      openBlocks: openCount,
      teaserBlocks: teaserBlocks.length,
      totalBlocks: openCount + lockedBlockList.length,
      lockedBlocks
    };
  }

  // 3) Нет явного делителя и нет override — авто по первому divider в HTML или 20%
  const fullHtml = parseEnhancedMarkdown(markdown);
  const blocks = extractHtmlBlocks(fullHtml);
  const split = splitAtFirstDivider(blocks, DEFAULT_TEASER_BLOCKS);

  return {
    openHtml: split.openBlocks.map(b => b.html).join('\n'),
    teaserHtml: split.teaserBlocks.map(b => b.html).join('\n'),
    openBlocks: split.openCount,
    teaserBlocks: split.teaserCount,
    totalBlocks: split.totalCount,
    lockedBlocks: split.lockedBlocks.map(b => b.html)
  };
}

/**
 * Extract individual blocks for admin preview
 */
function extractBlocks(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return { blocks: [], totalBlocks: 0 };
  }

  const { cleanedMarkdown } = extractMeta(markdown);
  const fullHtml = parseEnhancedMarkdown(markdown);
  const htmlBlocks = extractHtmlBlocks(fullHtml);

  const blocks = [];
  let index = 0;

  for (const block of htmlBlocks) {
    if (!block.isCountable) continue;
    index++;
    blocks.push({
      index,
      type: block.isDivider ? 'divider' : 'content',
      html: block.html,
      text: stripHtml(block.html)
    });
  }

  return { blocks, totalBlocks: index };
}

/**
 * Extract blocks with markers attached
 * Non-countable blocks are attached to the previous countable block
 */
function extractBlocksWithMarkers(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return { blocks: [], totalBlocks: 0 };
  }

  const { cleanedMarkdown } = extractMeta(markdown);
  const fullHtml = parseEnhancedMarkdown(markdown);
  const htmlBlocks = extractHtmlBlocks(fullHtml);

  const blocks = [];
  let index = 0;
  let leadingCarry = '';

  for (const block of htmlBlocks) {
    if (block.isCountable) {
      index++;
      const composedHtml = leadingCarry ? leadingCarry + block.html : block.html;
      blocks.push({
        index,
        type: 'content',
        html: composedHtml,
        text: stripHtml(composedHtml)
      });
      leadingCarry = '';
    } else {
      if (blocks.length) {
        blocks[blocks.length - 1].html += block.html;
      } else {
        leadingCarry += block.html;
      }
    }
  }

  return { blocks, totalBlocks: index };
}

/**
 * Analyze paywall structure (legacy compatibility)
 */
function analyzePaywallStructure(markdown) {
  return buildPaywallSegments(markdown);
}

module.exports = {
  buildPaywallSegments,
  extractBlocks,
  extractBlocksWithMarkers,
  analyzePaywallStructure,
  extractHtmlBlocks,
  DEFAULT_TEASER_BLOCKS
};
