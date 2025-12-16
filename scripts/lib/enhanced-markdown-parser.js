const { marked } = require('marked');

/**
 * Enhanced Markdown Parser
 * Processes markdown with HTML comment markers and converts them to structured HTML with CSS classes
 */

// Marker to HTML mapping
const MARKER_MAP = {
    meta: { tag: 'nav', class: 'article-breadcrumb', selfClosing: false },
    subtitle: { tag: 'p', class: 'article-subtitle', selfClosing: false },
    lead: { tag: 'div', class: 'article-lead', selfClosing: false },
    divider: { tag: 'div', class: 'article-divider', selfClosing: true },
    section: { tag: 'div', class: 'section-label', selfClosing: false },
    highlight: { tag: 'blockquote', class: 'composition-highlight', selfClosing: false },
    marker: { tag: 'span', class: 'marker-highlight', selfClosing: false },
    emphasized: { tag: 'span', class: 'emphasized-word', selfClosing: false },
    pullquote: { tag: 'div', class: 'pullquote article-card', selfClosing: false },
    callout: { tag: 'div', class: 'number-callout article-card', selfClosing: false },
    compare: { tag: 'div', class: 'two-column-compare', selfClosing: false },
    checklist: { tag: 'div', class: 'checklist article-card', selfClosing: false },
    footer: { tag: 'footer', class: 'article-footer', selfClosing: false },
    'component-card': { tag: 'div', class: 'component-card', selfClosing: false },
    'product-list': { tag: 'div', class: 'product-list', selfClosing: false }
};

// Inline-only markers (span wrappers) should not break surrounding text flow
// These are processed BEFORE marked() to prevent paragraph breaks
const INLINE_MARKERS = new Set(['marker', 'emphasized']);

/**
 * Pre-processes inline markers before markdown parsing.
 * Converts <!-- emphasized -->text<!-- /emphasized --> to <span class="emphasized-word">text</span>
 * This must happen BEFORE marked() to prevent paragraph breaks.
 * @param {string} markdown - Raw markdown with inline markers
 * @returns {string} Markdown with inline markers converted to HTML spans
 */
function preprocessInlineMarkers(markdown) {
    if (!markdown || typeof markdown !== 'string') {
        return markdown;
    }

    let result = markdown;

    for (const markerName of INLINE_MARKERS) {
        const config = MARKER_MAP[markerName];
        if (!config) continue;

        // Match <!-- markerName -->content<!-- /markerName -->
        // Use non-greedy match and handle multiline content
        const regex = new RegExp(
            `<!--\\s*${markerName}\\s*-->([\\s\\S]*?)<!--\\s*/${markerName}\\s*-->`,
            'g'
        );

        result = result.replace(regex, (match, content) => {
            // Trim leading/trailing whitespace but preserve internal structure
            const trimmed = content.trim();
            return `<${config.tag} class="${config.class}">${trimmed}</${config.tag}>`;
        });
    }

    return result;
}

/**
 * Extracts meta content (breadcrumb) from markdown
 * @param {string} markdown - The markdown content
 * @returns {Object} { meta: string|null, cleanedMarkdown: string }
 */
function extractMeta(markdown) {
    const metaRegex = /<!--\s*meta\s*-->\s*(.*?)\s*<!--\s*\/meta\s*-->/s;
    const match = markdown.match(metaRegex);

    if (!match) {
        return { meta: null, cleanedMarkdown: markdown };
    }

    const metaContent = match[1].trim();
    const cleanedMarkdown = markdown.replace(metaRegex, '');

    return { meta: metaContent, cleanedMarkdown };
}

/**
 * Renders breadcrumb navigation HTML
 * @param {string} breadcrumbText - Text like "Слишком умная уборка · раздел 1"
 * @returns {string} HTML breadcrumb
 */
function renderBreadcrumb(breadcrumbText) {
    if (!breadcrumbText) return '';

    // Split by middot separator
    const parts = breadcrumbText.split('·').map(s => s.trim());

    if (parts.length === 0) return '';

    // For course: "Слишком умная уборка · раздел X"
    // For recommendations: "Рекомендации · Title"
    // First part is link to parent, second is current page

    let html = '<nav class="article-breadcrumb">';

    if (parts.length === 1) {
        html += `<span>${escapeHtml(parts[0])}</span>`;
    } else {
        // First part(s) as links, last as current
        for (let i = 0; i < parts.length - 1; i++) {
            // First breadcrumb links to homepage, others use #
            const href = i === 0 ? '/' : '#';
            html += `<a href="${href}">${escapeHtml(parts[i])}</a>`;
            if (i < parts.length - 2) {
                html += '<span class="separator"> · </span>';
            }
        }
        html += '<span class="separator"> · </span>';
        html += `<span class="current">${escapeHtml(parts[parts.length - 1])}</span>`;
    }

    html += '</nav>';

    return html;
}

/**
 * Escapes HTML special characters
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function renderInlineMarkdown(text) {
    if (!text) return '';
    const trimmed = String(text).trim();
    if (!trimmed) return '';
    if (typeof marked.parseInline === 'function') {
        return marked.parseInline(trimmed);
    }
    // Fallback: remove outer <p> if parseInline отсутствует
    return marked(trimmed).replace(/^<p>/, '').replace(/<\/p>\s*$/, '');
}

function renderBlockMarkdown(text) {
    if (!text) return '';
    const trimmed = String(text).trim();
    if (!trimmed) return '';
    return marked(trimmed);
}

function escapeForRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replacePlaceholdersWithHtml(html, blocks) {
    let output = html;
    let iterations = 0;
    let replaced = true;

    // Replace in a couple of passes in case block HTML still contains placeholders
    while (replaced && iterations < 3) {
        replaced = false;
        iterations += 1;

        blocks.forEach(({ placeholder, html: blockHtml }) => {
            const escaped = escapeForRegex(placeholder);
            const withP = new RegExp(`<p>${escaped}<\\/p>`, 'g');
            const plain = new RegExp(escaped, 'g');

            const next = output
                .replace(withP, blockHtml)
                .replace(plain, blockHtml);

            if (next !== output) {
                replaced = true;
                output = next;
            }
        });
    }

    return output;
}

function renderWithNestedBlocks(text, { inline = false } = {}) {
    // Step 1: Pre-process inline markers (before markdown parsing)
    const withInline = preprocessInlineMarkers(text);

    // Step 2: Process block markers to placeholders
    // Skip self-closing markers (like divider) in nested blocks - they should only be processed at top level
    const { processed, blocks } = processMarkersToPlaceholders(withInline, { skipSelfClosing: true });

    // Step 3: Render markdown
    let html = inline ? renderInlineMarkdown(processed) : renderBlockMarkdown(processed);

    // Step 4: Replace placeholders with rendered blocks
    html = replacePlaceholdersWithHtml(html, blocks);

    return html;
}

/**
 * Renders content of a marker to finalized HTML block
 */
function renderMarkerBlock(markerName, innerContent, config) {
    const isInlineTag = config.tag === 'span';

    // Special handling for highlight blocks - remove blockquote > marker
    if (markerName === 'highlight') {
        const cleaned = innerContent.replace(/^\s*>\s*/gm, '');
        const body = renderWithNestedBlocks(cleaned, { inline: false });
        return `<${config.tag} class="${config.class}">${body}</${config.tag}>`;
    }

    if (markerName === 'compare') {
        const parts = innerContent.split(/\n---\n/);
        const renderCompareCard = (raw) => {
            const lines = raw.trim().split(/\n+/);
            const title = lines.shift() || '';
            let heading = '';
            if (lines.length && lines[0].trim()) {
                heading = lines.shift();
            }
            const body = lines.join('\n').trim();

            return `<div class="compare-card article-card">` +
                (title ? `<div class="compare-card-title">${renderInlineMarkdown(title)}</div>` : '') +
                (heading ? `<div class="compare-card-heading">${renderInlineMarkdown(heading)}</div>` : '') +
                (body ? renderWithNestedBlocks(body, { inline: false }) : '') +
                `</div>`;
        };

        if (parts.length === 2) {
            return `<${config.tag} class="${config.class}">` +
                renderCompareCard(parts[0]) +
                renderCompareCard(parts[1]) +
                `</${config.tag}>`;
        }
    }

    if (markerName === 'callout') {
        const lines = innerContent.trim().split(/\n\n+/);
        if (lines.length >= 2) {
            const labelMatch = lines[0].match(/^\*\*(.+?)\*\*$/);
            const label = renderInlineMarkdown(labelMatch ? labelMatch[1] : lines[0]);

            const valueMatch = lines[1].match(/^\*\*(.+?)\*\*$/);
            const value = renderInlineMarkdown(valueMatch ? valueMatch[1] : lines[1]);

            const descriptionRaw = lines.slice(2).join('\n\n').trim();
            const description = descriptionRaw ? renderWithNestedBlocks(descriptionRaw, { inline: false }) : '';

            return `<${config.tag} class="${config.class}">` +
                `<div class="number-callout-label">${label}</div>` +
                `<div class="number-callout-value">${value}</div>` +
                (description ? `<div class="number-callout-text">${description}</div>` : '') +
                `</${config.tag}>`;
        }
    }

    if (markerName === 'checklist') {
        const content = innerContent.trim();
        const titleMatch = content.match(/^\*\*(.+?)\*\*\s*\n\n?([\s\S]*)$/);

        if (titleMatch) {
            const title = renderInlineMarkdown(titleMatch[1]);
            const listContent = titleMatch[2].trim();

            const items = listContent
                .split(/\n/)
                .filter(line => /^\s*[\*\-]\s+/.test(line))
                .map(line => line.replace(/^\s*[\*\-]\s+/, '').trim());

            if (items.length > 0) {
                const listMarkdown = items.map(item => `- ${item}`).join('\n');
                const listHtml = renderWithNestedBlocks(listMarkdown, { inline: false });
                return `<${config.tag} class="${config.class}">` +
                    `<div class="checklist-title">${title}</div>` +
                    listHtml +
                    `</${config.tag}>`;
            }
        }
    }

    if (markerName === 'lead') {
        const body = renderWithNestedBlocks(innerContent, { inline: false });
        return `<${config.tag} class="${config.class}">${body}</${config.tag}>`;
    }

    // Section label should be rendered as inline (no <p> tags)
    if (markerName === 'section') {
        const body = renderInlineMarkdown(innerContent);
        return `<${config.tag} class="${config.class}">${body}</${config.tag}>`;
    }

    if (markerName === 'pullquote') {
        const cleaned = innerContent.replace(/^\s*>\s?/gm, '').trim();
        const lines = cleaned.split(/\n+/).filter(Boolean);
        let heading = '';
        if (lines.length && /^\*\*(.+)\*\*$/.test(lines[0])) {
            heading = lines.shift().replace(/^\*\*(.+)\*\*$/, '$1');
        }
        const bodyText = lines.join('\n').trim();
        const body = bodyText ? renderWithNestedBlocks(bodyText, { inline: false }) : '';
        return `<${config.tag} class="${config.class}">` +
            (heading ? `<small>${escapeHtml(heading)}</small>` : '') +
            body +
            `</${config.tag}>`;
    }

    const useInline = isInlineTag || config.tag === 'p';
    const renderedContent = useInline
        ? renderWithNestedBlocks(innerContent, { inline: true })
        : renderWithNestedBlocks(innerContent, { inline: false });

    return `<${config.tag} class="${config.class}">${renderedContent}</${config.tag}>`;
}

/**
 * Processes HTML comment markers to placeholders and returns blocks map
 * @param {string} markdown - Markdown content
 * @param {Object} options - Processing options
 * @param {boolean} options.skipSelfClosing - If true, skip self-closing markers (for nested block processing)
 * @returns {{ processed: string, blocks: Array<{placeholder: string, html: string}> }}
 */
function processMarkersToPlaceholders(markdown, options = {}) {
    const { skipSelfClosing = false } = options;
    let processed = markdown;
    const blocks = [];
    let counter = 0;

    const orderedEntries = [
        // Block-level first so nested inline markers are handled inside their block render
        ...Object.entries(MARKER_MAP).filter(([name]) => !INLINE_MARKERS.has(name)),
        // Inline markers last to avoid breaking surrounding markdown structures
        ...Object.entries(MARKER_MAP).filter(([name]) => INLINE_MARKERS.has(name))
    ];

    // Process each marker type (skip inline markers - they're handled by preprocessInlineMarkers)
    for (const [markerName, config] of orderedEntries) {
        // Skip inline markers - they are pre-processed before marked()
        if (INLINE_MARKERS.has(markerName)) {
            continue;
        }
        const spacer = '\n\n';

        // Skip self-closing markers if requested (for nested block processing)
        if (config.selfClosing && skipSelfClosing) {
            continue;
        }

        if (config.selfClosing) {
            // Self-closing markers like <!-- divider -->
            const regex = new RegExp(`<!--\\s*${markerName}\\s*-->`, 'g');
            processed = processed.replace(regex, () => {
                const html = `<${config.tag} class="${config.class}"></${config.tag}>`;
                const placeholder = `@@BLOCK_${counter++}@@`;
                blocks.push({ placeholder, html });
                return `${spacer}${placeholder}${spacer}`;
            });
        } else {
            // Paired markers like <!-- highlight -->...<!-- /highlight -->
            const regex = new RegExp(
                `<!--\\s*${markerName}\\s*-->[\\s\\S]*?<!--\\s*\\/${markerName}\\s*-->`,
                'g'
            );

            processed = processed.replace(regex, (match) => {
                const contentRegex = new RegExp(
                    `<!--\\s*${markerName}\\s*-->\\s*([\\s\\S]*?)\\s*<!--\\s*\\/${markerName}\\s*-->`
                );
                const contentMatch = match.match(contentRegex);

                if (!contentMatch) return match;

                const innerContent = contentMatch[1];
                const html = renderMarkerBlock(markerName, innerContent, config);
                const placeholder = `@@BLOCK_${counter++}@@`;
                blocks.push({ placeholder, html });
                return `${spacer}${placeholder}${spacer}`;
            });
        }
    }

    return { processed, blocks };
}

/**
 * Main function: Parses enhanced markdown with HTML comment markers
 * @param {string} markdown - Enhanced markdown content
 * @returns {string} HTML output
 */
function parseEnhancedMarkdown(markdown) {
    if (!markdown || typeof markdown !== 'string') {
        return '';
    }

    // Step 1: Extract breadcrumb meta
    const { meta, cleanedMarkdown } = extractMeta(markdown);

    // Step 2: Pre-process inline markers (BEFORE marked to prevent paragraph breaks)
    const withInlineProcessed = preprocessInlineMarkers(cleanedMarkdown);

    // Step 3: Process block markers to placeholders
    const { processed: processedMarkdown, blocks } = processMarkersToPlaceholders(withInlineProcessed);

    // Step 4: Run standard marked() on the processed markdown (placeholders remain as text)
    let html = marked(processedMarkdown);

    // Step 4: Replace placeholders with rendered blocks (strip <p> wrappers if any)
    html = replacePlaceholdersWithHtml(html, blocks);

    // Step 4: Insert breadcrumb 
    const breadcrumbHtml = renderBreadcrumb(meta);
    if (breadcrumbHtml) {
        // Try to insert before h1, otherwise prepend
        if (html.includes('<h1')) {
            html = html.replace(/(<h1[^>]*>)/, breadcrumbHtml + '\n$1');
        } else {
            // h1 was stripped by build.js, prepend breadcrumb
            html = breadcrumbHtml + '\n' + html;
        }
    }

    return html;
}

/**
 * Checks if markdown contains enhanced markers
 * @param {string} markdown
 * @returns {boolean}
 */
function hasEnhancedMarkers(markdown) {
    if (!markdown || typeof markdown !== 'string') {
        return false;
    }
    return /<!--\s*[a-z-]+\s*-->/.test(markdown);
}

module.exports = {
    parseEnhancedMarkdown,
    hasEnhancedMarkers,
    extractMeta,
    renderBreadcrumb,
    processMarkers: processMarkersToPlaceholders
};
