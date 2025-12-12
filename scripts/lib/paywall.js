const { marked } = require('marked');
const { processMarkers, extractMeta, renderBreadcrumb } = require('./enhanced-markdown-parser');

const DEFAULT_TEASER_BLOCKS = 3;

function preparePaywallMarkdown(markdown = '') {
  const source = typeof markdown === 'string' ? markdown : '';
  const { meta, cleanedMarkdown } = extractMeta(source);
  const processed = processMarkers(cleanedMarkdown || '');
  const breadcrumb = renderBreadcrumb(meta);
  return breadcrumb ? `${breadcrumb}\n\n${processed}` : processed;
}

function isCountableToken(token) {
  if (!token || token.type === 'space') return false;
  if (token.type === 'html') {
    const raw = typeof token.raw === 'string' ? token.raw.trim() : '';
    const text = typeof token.text === 'string' ? token.text.trim() : '';
    const value = raw || text;
    if (value.startsWith('<!--')) return false;
    if (/^<nav[^>]+article-breadcrumb/i.test(value)) return false;
  }
  return true;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function attachLinks(tokens, links) {
  return Object.assign([], tokens, { links: links || {} });
}

function splitTokensByBlocks(tokens, openBlocks = 1, teaserBlocks = DEFAULT_TEASER_BLOCKS) {
  const openTokens = [];
  const teaserTokens = [];
  let blockCounter = 0;
  let teaserCounter = 0;

  for (const token of tokens) {
    const isSpace = token.type === 'space';
    const countable = isCountableToken(token);
    if (countable) {
      blockCounter++;
    }

    if (blockCounter <= openBlocks) {
      openTokens.push(token);
      continue;
    }

    if (countable && teaserCounter >= teaserBlocks) {
      continue;
    }

    if (countable) {
      teaserCounter++;
    }
    if (teaserCounter <= teaserBlocks) {
      teaserTokens.push(token);
    }
  }

  const totalBlocks = tokens.filter(isCountableToken).length;

  return {
    openTokens,
    teaserTokens,
    openBlocks: Math.min(openBlocks, totalBlocks),
    teaserBlocks: teaserCounter,
    totalBlocks
  };
}

// Port of legacy heuristic with block counts
function analyzePaywallStructure(markdown) {
  const prepared = preparePaywallMarkdown(markdown);
  const tokens = marked.lexer(prepared);
  let openTokens = [];
  let teaserTokens = [];
  let boundaryIndex = -1;

  const h1Index = tokens.findIndex(t => t.type === 'heading' && t.depth === 1);
  const startIndex = h1Index !== -1 ? h1Index + 1 : 0;

  if (h1Index !== -1) {
    openTokens.push(tokens[h1Index]);
  }

  const introSubheaderIndex = tokens.findIndex((t, i) =>
    i >= startIndex &&
    t.type === 'heading' &&
    t.depth > 1 &&
    /введение|introduction/i.test(t.text)
  );

  if (introSubheaderIndex !== -1) {
    let currentIdx = introSubheaderIndex;
    let paragraphCount = 0;
    openTokens.push(tokens[introSubheaderIndex]);

    currentIdx++;
    while (currentIdx < tokens.length) {
      const t = tokens[currentIdx];
      if (t.type === 'heading' && t.depth <= tokens[introSubheaderIndex].depth) {
        break;
      }
      if (t.type === 'hr') {
        break;
      }

      openTokens.push(t);
      if (t.type === 'paragraph') {
        paragraphCount++;
        if (paragraphCount >= 3) break;
      }
      currentIdx++;
    }
    boundaryIndex = currentIdx;

  } else {
    const firstSubheaderIndex = tokens.findIndex((t, i) => i >= startIndex && t.type === 'heading');
    const limitIndex = firstSubheaderIndex !== -1 ? firstSubheaderIndex : tokens.length;

    let hasTextAfterH1 = false;
    for (let i = startIndex; i < limitIndex; i++) {
      if (tokens[i].type === 'paragraph') {
        hasTextAfterH1 = true;
        break;
      }
    }

    if (hasTextAfterH1) {
      let currentIdx = startIndex;
      let paragraphCount = 0;

      while (currentIdx < limitIndex) {
        const t = tokens[currentIdx];
        if (t.type === 'hr') break;

        openTokens.push(t);
        if (t.type === 'paragraph') {
          paragraphCount++;
          if (paragraphCount >= 3) break;
        }
        currentIdx++;
      }
      boundaryIndex = currentIdx;

    } else {
      if (firstSubheaderIndex !== -1) {
        openTokens.push(tokens[firstSubheaderIndex]);

        let currentIdx = firstSubheaderIndex + 1;
        let paragraphCount = 0;

        while (currentIdx < tokens.length) {
          const t = tokens[currentIdx];
          if (t.type === 'heading' && t.depth <= tokens[firstSubheaderIndex].depth) break;
          if (t.type === 'hr') break;

          openTokens.push(t);
          if (t.type === 'paragraph') {
            paragraphCount++;
            if (paragraphCount >= 3) break;
          }
          currentIdx++;
        }
        boundaryIndex = currentIdx;
      } else {
        let currentIdx = startIndex;
        let paragraphCount = 0;
        while (currentIdx < tokens.length) {
          const t = tokens[currentIdx];
          openTokens.push(t);
          if (t.type === 'paragraph') {
            paragraphCount++;
            if (paragraphCount >= 3) break;
          }
          currentIdx++;
        }
        boundaryIndex = currentIdx;
      }
    }
  }

  if (boundaryIndex !== -1 && boundaryIndex < tokens.length) {
    let currentIdx = boundaryIndex;
    let paragraphCount = 0;

    while (currentIdx < tokens.length) {
      const t = tokens[currentIdx];
      if (t.type === 'paragraph') {
        teaserTokens.push(t);
        paragraphCount++;
        if (paragraphCount >= DEFAULT_TEASER_BLOCKS) break;
      }
      currentIdx++;
    }
  }

  const totalBlocks = tokens.filter(isCountableToken).length;
  const openBlocks = openTokens.filter(isCountableToken).length;
  const teaserBlocks = teaserTokens.filter(isCountableToken).length;

  const openHtml = marked.parser(attachLinks(openTokens, tokens.links));
  const teaserHtml = marked.parser(attachLinks(teaserTokens, tokens.links));

  return { openHtml, teaserHtml, openBlocks, teaserBlocks, totalBlocks };
}

function buildPaywallSegments(markdown, override) {
  const prepared = preparePaywallMarkdown(markdown);
  const tokens = marked.lexer(prepared);
  const links = tokens.links || {};
  const totalBlocks = tokens.filter(isCountableToken).length;

  if (override && typeof override.openBlocks === 'number') {
    const openBlocks = Math.max(1, Math.min(override.openBlocks, totalBlocks || 1));
    const teaserBlocks = Math.max(0, override.teaserBlocks ?? DEFAULT_TEASER_BLOCKS);
    const split = splitTokensByBlocks(tokens, openBlocks, teaserBlocks);
    return {
      openHtml: marked.parser(attachLinks(split.openTokens, links)),
      teaserHtml: marked.parser(attachLinks(split.teaserTokens, links)),
      openBlocks: split.openBlocks,
      teaserBlocks: split.teaserBlocks,
      totalBlocks: split.totalBlocks
    };
  }

  // По умолчанию открываем не более 20% контента (минимум 1 блок, минимум 1 блок остаётся закрытым при total>=2)
  const targetOpen = totalBlocks > 0
    ? Math.min(
      Math.max(1, Math.floor(totalBlocks * 0.2)),
      totalBlocks - 1 || 1
    )
    : 0;
  const split = splitTokensByBlocks(tokens, targetOpen, 0);

  return {
    openHtml: marked.parser(attachLinks(split.openTokens, links)),
    teaserHtml: '',
    openBlocks: split.openBlocks,
    teaserBlocks: 0,
    totalBlocks: split.totalBlocks
  };
}

function extractBlocks(markdown) {
  const prepared = preparePaywallMarkdown(markdown);
  const tokens = marked.lexer(prepared);
  const links = tokens.links || {};
  const blocks = [];
  let index = 0;

  tokens.forEach((token, tokenIndex) => {
    if (!isCountableToken(token)) return;
    index += 1;
    const html = marked.parser(attachLinks([token], links));
    blocks.push({
      index,
      tokenIndex,
      type: token.type,
      html,
      text: stripHtml(html)
    });
  });

  return { blocks, totalBlocks: index };
}

module.exports = {
  buildPaywallSegments,
  extractBlocks,
  analyzePaywallStructure,
  DEFAULT_TEASER_BLOCKS
};
