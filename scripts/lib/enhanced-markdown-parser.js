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
    pullquote: { tag: 'div', class: 'pullquote article-card', selfClosing: false },
    callout: { tag: 'div', class: 'number-callout article-card', selfClosing: false },
    compare: { tag: 'div', class: 'two-column-compare', selfClosing: false },
    checklist: { tag: 'div', class: 'checklist article-card', selfClosing: false },
    footer: { tag: 'footer', class: 'article-footer', selfClosing: false },
    'component-card': { tag: 'div', class: 'component-card', selfClosing: false },
    'product-list': { tag: 'div', class: 'product-list', selfClosing: false }
};

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
            html += `<a href="#">${escapeHtml(parts[i])}</a>`;
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

/**
 * Processes HTML comment markers and converts them to proper HTML
 * @param {string} markdown - Markdown content
 * @returns {string} Processed markdown with markers replaced
 */
function processMarkers(markdown) {
    let processed = markdown;

    // Process each marker type
    for (const [markerName, config] of Object.entries(MARKER_MAP)) {
        if (config.selfClosing) {
            // Self-closing markers like <!-- divider -->
            const regex = new RegExp(`<!--\\s*${markerName}\\s*-->`, 'g');
            processed = processed.replace(regex, `<${config.tag} class="${config.class}"></${config.tag}>`);
        } else {
            // Paired markers like <!-- highlight -->...<!-- /highlight -->
            const regex = new RegExp(
                `<!--\\s*${markerName}\\s*-->[\\s\\S]*?<!--\\s*\\/${markerName}\\s*-->`,
                'g'
            );

            processed = processed.replace(regex, (match) => {
                // Extract content between opening and closing markers
                const contentRegex = new RegExp(
                    `<!--\\s*${markerName}\\s*-->\\s*([\\s\\S]*?)\\s*<!--\\s*\\/${markerName}\\s*-->`
                );
                const contentMatch = match.match(contentRegex);

                if (!contentMatch) return match;

                let innerContent = contentMatch[1];

                // Special handling for highlight blocks - remove blockquote > marker
                if (markerName === 'highlight') {
                    // Remove leading > from lines (blockquote syntax)
                    innerContent = innerContent.replace(/^\s*>\s*/gm, '');
                    // Wrap in <p> if not already wrapped
                    innerContent = innerContent.trim();
                    if (!innerContent.startsWith('<p>')) {
                        innerContent = `<p>${innerContent}</p>`;
                    }
                }

                // Special handling for compare blocks - split by --- separator
                if (markerName === 'compare') {
                    const parts = innerContent.split(/\n---\n/);
                    if (parts.length === 2) {
                        return `<${config.tag} class="${config.class}">` +
                            `<div class="compare-card">${parts[0].trim()}</div>` +
                            `<div class="compare-card">${parts[1].trim()}</div>` +
                            `</${config.tag}>`;
                    }
                }

                // Standard wrapping
                return `<${config.tag} class="${config.class}">${innerContent}</${config.tag}>`;
            });
        }
    }

    return processed;
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

    // Step 2: Process HTML comment markers to proper HTML
    const processedMarkdown = processMarkers(cleanedMarkdown);

    // Step 3: Run standard marked() on the processed markdown
    let html = marked(processedMarkdown);

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
    processMarkers
};
