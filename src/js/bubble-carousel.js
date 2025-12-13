/**
 * Bubble Carousel - Complete Refactored Implementation
 * Based on carousel-switchable.jsx React template
 * 
 * Modes:
 * - Desktop/Tablet: Vertical stacked cards (2 visible at a time)
 * - Mobile: Horizontal scroll carousel with infinite loop
 * 
 * Features:
 * - Dynamic content loading from /shared/recommendations.json
 * - Fallback to DOM data if API fails
 * - Autoplay with pause on interaction
 * - Dot navigation
 * - Mode switching via body[data-mode]
 */

(function () {
    'use strict';

    const RECOMMENDATIONS_URL = '/shared/recommendations.json';
    const AUTOPLAY_INTERVAL = 4000;
    const PAYWALL_IDLE_DELAY = 600;

    // Infinite scroll constants
    const CLONE_COUNT = 3;

    /**
     * Get card total (width + gap) dynamically from DOM
     * Supports different card widths for mobile (70vw) vs desktop (280px)
     */
    function getComputedGap() {
        if (!track) return 16;
        const style = window.getComputedStyle(track);
        // Для колонок (desktop) основной — row-gap; для mobile — gap/columnGap
        const candidates = [style.rowGap, style.columnGap, style.gap];
        for (const val of candidates) {
            const parsed = parseFloat(val);
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
        return 16;
    }

    function getCardTotal() {
        const card = track?.querySelector('.bubble-card');
        if (!card) return 276; // fallback: 260 + default gap
        const cardWidth = card.offsetWidth || 260;
        const gap = getComputedGap();
        return cardWidth + gap;
    }

    function scheduleInitWithIdle(fn) {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(fn, { timeout: 1000 });
            return;
        }
        setTimeout(fn, PAYWALL_IDLE_DELAY);
    }

    let carousel = null;
    let scrollWrapper = null;  // Wrapper for horizontal scroll
    let track = null;
    let dotsContainer = null;
    let cardsData = [];
    let currentIndex = 0;
    let autoplayTimer = null;
    let isPaused = false;
    let isHorizontal = false;
    let isScrolling = false; // Lock to prevent recursive scroll during teleport

    /**
     * Get current mode from body[data-mode] attribute
     */
    function getCurrentMode() {
        return document.body.getAttribute('data-mode') || 'desktop';
    }

    /**
     * Check if current mode uses horizontal scroll (all except desktop-wide)
     * Desktop-wide uses vertical stacked layout
     */
    function isSideMode() {
        return getCurrentMode() === 'desktop-wide';
    }

    function checkIsHorizontal() {
        // Horizontal scroll for mobile, tablet, and regular desktop (inline below content)
        // Side column (desktop-wide) uses vertical/stacked rendering
        return !isSideMode();
    }

    /**
     * Initialize the bubble carousel
     */
    function init() {
        carousel = document.querySelector('.bubble-carousel');
        if (!carousel) return;

        scrollWrapper = carousel.querySelector('.bubble-carousel__scroll-wrapper');
        track = carousel.querySelector('[data-carousel-track]');
        dotsContainer = carousel.querySelector('[data-carousel-dots]');
        if (!track || !scrollWrapper) return;

        // Detect initial mode
        isHorizontal = checkIsHorizontal();

        // Read fallback data from DOM
        const fallbackData = readCardsFromDOM();

        // Try to fetch from API
        fetchRecommendations()
            .then(data => {
                if (data && data.length > 0) {
                    cardsData = data;
                } else {
                    cardsData = fallbackData;
                }
                renderCards();
                startAutoplay();
            })
            .catch(() => {
                cardsData = fallbackData;
                renderCards();
                startAutoplay();
            });

        // Event listeners
        carousel.addEventListener('mouseenter', pauseAutoplay);
        carousel.addEventListener('mouseleave', resumeAutoplay);

        // Touch events for mobile
        if (track) {
            track.addEventListener('touchstart', pauseAutoplay, { passive: true });
            track.addEventListener('touchend', resumeAutoplay, { passive: true });
            // Dots update during scroll
            scrollWrapper.addEventListener('scroll', handleScroll, { passive: true });
            // Teleport check after scroll settles
            scrollWrapper.addEventListener('scroll', onScrollForTeleport, { passive: true });
        }

        // Watch for data-mode attribute changes on body
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-mode') {
                    updateMode();
                }
            }
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
    }

    /**
     * Update mode when body[data-mode] changes
     */
    function updateMode() {
        const wasHorizontal = isHorizontal;
        isHorizontal = checkIsHorizontal();

        if (wasHorizontal !== isHorizontal) {
            // Mode changed - re-render cards
            currentIndex = 0;
            renderCards();
        }
    }

    /**
     * Fetch recommendations from API
     */
    async function fetchRecommendations() {
        try {
            const response = await fetch(RECOMMENDATIONS_URL);
            if (!response.ok) return null;
            const data = await response.json();
            return Array.isArray(data) ? data : null;
        } catch {
            return null;
        }
    }

    /**
     * Read card data from existing DOM elements (fallback)
     */
    function readCardsFromDOM() {
        const cards = track?.querySelectorAll('.bubble-card') || [];
        const data = [];
        cards.forEach((card) => {
            const emoji = card.querySelector('.bubble-card__emoji')?.textContent?.trim() || '📋';
            const title = card.querySelector('.bubble-card__title')?.textContent?.trim() || '';
            const desc = card.querySelector('.bubble-card__desc')?.textContent?.trim() || '';
            const url = card.href || card.dataset.url || '';
            if (title) {
                data.push({ emoji, title, description: desc, url });
            }
        });
        return data;
    }

    /**
     * Create cloned slides for infinite scroll (mobile)
     * React template lines 37-42
     */
    function createInfiniteSlides(slides) {
        const beforeClones = slides.slice(-CLONE_COUNT).map((s, i) => ({
            ...s,
            id: `before-${i}`,
            isClone: true
        }));
        const afterClones = slides.slice(0, CLONE_COUNT).map((s, i) => ({
            ...s,
            id: `after-${i}`,
            isClone: true
        }));
        return [...beforeClones, ...slides, ...afterClones];
    }

    /**
     * Render all cards
     */
    function renderCards() {
        if (!track || cardsData.length === 0) {
            if (carousel) carousel.classList.add('is-hidden');
            return;
        }

        carousel.classList.remove('is-hidden');
        track.innerHTML = '';

        if (isHorizontal) {
            // Mobile: render with clones for infinite scroll
            // All cards visible, scroll-snap handles positioning
            const infiniteSlides = createInfiniteSlides(cardsData);
            infiniteSlides.forEach((card, index) => {
                const element = createCardElement(card, index);
                track.appendChild(element);
            });

            // Set initial scroll position (offset by CLONE_COUNT)
            // React template lines 232-237
            requestAnimationFrame(() => {
                const initialScroll = (CLONE_COUNT + currentIndex) * getCardTotal();
                scrollWrapper.scrollLeft = initialScroll;
            });
        } else {
            // Desktop: render only original cards
            // CSS hides cards beyond 2 via :nth-child(n+3) { display: none }
            cardsData.forEach((card, index) => {
                const element = createCardElement(card, index);
                track.appendChild(element);
            });
            updateVisibleCards();
        }

        renderDots();
        carousel.setAttribute('data-loaded', 'true');
    }

    /**
     * Create a single card element with SVG bubble shape
     * The path includes both rounded rectangle and speech bubble tail
     */
    function createCardElement(card, index) {
        const isLink = Boolean(card.url);
        const element = document.createElement(isLink ? 'a' : 'div');
        element.className = 'bubble-card';
        element.setAttribute('data-card', '');
        element.setAttribute('data-index', index);
        if (card.isClone) {
            element.setAttribute('data-clone', 'true');
        }

        if (isLink) {
            element.href = card.url;
        }

        // SVG bubble path: rounded rect (280x200) with r=24, plus tail at bottom-right
        // Tail: 60px wide (x=180 to x=240), 13px tall, peak at x=210
        // Path offset by 2px to account for stroke padding
        const bubblePath = `
            M24,0 
            H256 
            Q280,0 280,24 
            V176 
            Q280,200 256,200 
            H240 
            C230,200 220,213 210,213 
            C200,213 190,200 180,200 
            H24 
            Q0,200 0,176 
            V24 
            Q0,0 24,0 
            Z
        `;

        // viewBox has 2px padding on all sides for stroke
        element.innerHTML = `
            <svg class="bubble-card__shape" viewBox="-2 -2 284 217" preserveAspectRatio="none" aria-hidden="true">
                <path class="bubble-card__bg" d="${bubblePath}" />
                <path class="bubble-card__stroke" d="${bubblePath}" />
            </svg>
            <div class="bubble-card__content">
                <span class="bubble-card__emoji">${card.emoji || card.cover || card.icon || '📋'}</span>
                <h3 class="bubble-card__title">${card.title || ''}</h3>
                <p class="bubble-card__desc">${card.description || ''}</p>
            </div>
        `;

        return element;
    }

    /**
     * Render dot navigation
     */
    function renderDots() {
        if (!dotsContainer) return;
        dotsContainer.innerHTML = '';

        const total = isHorizontal
            ? cardsData.length
            : (isSideMode() ? cardsData.length : Math.ceil(cardsData.length / 2));

        for (let i = 0; i < total; i++) {
            const dot = document.createElement('button');
            dot.className = 'bubble-carousel__dot';
            dot.type = 'button';
            dot.setAttribute('aria-label', `Перейти к ${i + 1}`);

            if (i === currentIndex) {
                dot.setAttribute('aria-current', 'true');
                dot.classList.add('is-active');
            }

            dot.addEventListener('click', (e) => {
                e.preventDefault();
                goToSlide(i);
            });
            dotsContainer.appendChild(dot);
        }
    }

    /**
     * Update dots to reflect current index
     */
    function updateDots() {
        if (!dotsContainer) return;
        const dots = dotsContainer.querySelectorAll('.bubble-carousel__dot');
        dots.forEach((dot, i) => {
            if (i === currentIndex) {
                dot.setAttribute('aria-current', 'true');
                dot.classList.add('is-active');
            } else {
                dot.removeAttribute('aria-current');
                dot.classList.remove('is-active');
            }
        });
    }

    /**
     * Go to specific slide
     */
    function goToSlide(index) {
        if (isHorizontal) {
            // Mobile/inline: scroll to card position
            currentIndex = index;
            updateDots();
            scrollToCard(index, true);
        } else {
            // Stack/side: update visible cards
            currentIndex = index;
            updateDots();
            updateVisibleCards();
        }
    }

    /**
     * Scroll to specific card (mobile mode)
     * React template lines 271-280
     */
    function scrollToCard(index, smooth = true) {
        if (!track) return;
        isScrolling = true;
        const targetScroll = (CLONE_COUNT + index) * getCardTotal();
        scrollWrapper.scrollTo({
            left: targetScroll,
            behavior: smooth ? 'smooth' : 'auto'
        });
        setTimeout(() => { isScrolling = false; }, 100);
    }

    /**
     * Update visible cards (desktop mode)
     * React template lines 282-284:
     * visibleSlides = [slides[currentIndex], slides[(currentIndex + 1) % slides.length]]
     * 
     * We use CSS :nth-child to hide cards, and reorder DOM for visibility
     */
    function updateVisibleCards() {
        const cards = track.querySelectorAll('.bubble-card');
        const total = cardsData.length;
        if (total === 0) return;

        const visibleCount = isSideMode() ? 1 : 2;
        // Strict 1 card for side mode as requested ("одна карточка в вертикальном формате")
        const idx1 = (currentIndex * 1) % total;
        const idx2 = (visibleCount === 2) ? (currentIndex * 1 + 1) % total : null;

        // Note: For side mode (1 card), step is 1. For horizontal desktop (if we want 2), step might be 2?
        // Actually, user just said "1 card in vertical". Horizontal they didn't specify visible count, 
        // but implied scrolling. "Horizontal mode" usually implies scroll.
        // Let's stick to: Vertical = 1 card fixed. Horizontal = All cards scrollable.

        // If we are in side mode, we only show 1 card.
        // If we are in horizontal mode, we generally don't use this function because 
        // we use scroll-snap with creating clones in 'renderCards'.
        // Wait, renderCards calls updateVisibleCards ONLY for !isHorizontal (which includes Side Mode).
        // So this function is primarily for Side Mode now.

        const cardArray = Array.from(cards);
        const card1 = cardArray[idx1] || null;
        const card2 = idx2 !== null ? (cardArray[idx2] || null) : null;

        track.innerHTML = '';
        if (card1) track.appendChild(card1);
        if (card2) track.appendChild(card2);

        // Re-add remaining cards (они скрыты CSS начиная с третьего элемента)
        cardArray.forEach((card, i) => {
            if (i !== idx1 && i !== idx2) {
                track.appendChild(card);
            }
        });
    }

    /**
     * Handle scroll event - update dots only
     */
    function handleScroll() {
        if (!isHorizontal || !track || isScrolling) return;

        const scrollLeft = scrollWrapper.scrollLeft;
        const totalOriginal = cardsData.length;
        const cardTotal = getCardTotal();

        // Calculate real index accounting for clones
        const rawIndex = Math.round(scrollLeft / cardTotal);
        const adjustedIndex = rawIndex - CLONE_COUNT;
        const realIndex = ((adjustedIndex % totalOriginal) + totalOriginal) % totalOriginal;

        if (realIndex !== currentIndex) {
            currentIndex = realIndex;
            updateDots();
        }
    }

    /**
     * Check if we're on a clone and need to teleport
     * Called after scroll settles (via scrollend or timeout)
     */
    function checkTeleport() {
        if (!isHorizontal || !track || isScrolling) return;

        const scrollLeft = scrollWrapper.scrollLeft;
        const totalOriginal = cardsData.length;
        const cardTotal = getCardTotal();

        // Which card position are we at?
        const cardIndex = Math.round(scrollLeft / cardTotal);

        // Clone boundaries
        const firstOriginal = CLONE_COUNT;  // index 3
        const lastOriginal = CLONE_COUNT + totalOriginal - 1;  // e.g., 6 for 4 cards

        if (cardIndex < firstOriginal) {
            // On before-clone → teleport forward
            teleport(scrollLeft + (totalOriginal * cardTotal));
        } else if (cardIndex > lastOriginal) {
            // On after-clone → teleport backward
            teleport(scrollLeft - (totalOriginal * cardTotal));
        }
    }

    /**
     * Instant teleport without visual jump
     */
    function teleport(newScrollLeft) {
        isScrolling = true;

        // Disable scroll-snap during teleport
        scrollWrapper.style.scrollSnapType = 'none';
        scrollWrapper.style.scrollBehavior = 'auto';

        scrollWrapper.scrollLeft = newScrollLeft;

        // Re-enable after render
        requestAnimationFrame(() => {
            scrollWrapper.style.scrollSnapType = '';
            scrollWrapper.style.scrollBehavior = '';
            isScrolling = false;
        });
    }

    // Debounced scroll-end detection for teleportation
    let scrollEndTimer = null;
    function onScrollForTeleport() {
        if (!isHorizontal || isScrolling) return;
        if (scrollEndTimer) clearTimeout(scrollEndTimer);
        scrollEndTimer = setTimeout(checkTeleport, 100);
    }

    /**
     * Start autoplay
     */
    function startAutoplay() {
        stopAutoplay();
        if (cardsData.length <= 1) return;

        autoplayTimer = setInterval(() => {
            if (!isPaused) {
                nextSlide();
            }
        }, AUTOPLAY_INTERVAL);
    }

    /**
     * Stop autoplay
     */
    function stopAutoplay() {
        if (autoplayTimer) {
            clearInterval(autoplayTimer);
            autoplayTimer = null;
        }
    }

    /**
     * Pause autoplay (on hover/touch)
     */
    function pauseAutoplay() {
        isPaused = true;
    }

    /**
     * Resume autoplay (on mouse leave/touch end)
     */
    function resumeAutoplay() {
        isPaused = false;
    }

    /**
     * Go to next slide
     */
    function nextSlide() {
        const total = isHorizontal
            ? cardsData.length
            : (isSideMode() ? cardsData.length : Math.ceil(cardsData.length / 2));
        const next = (currentIndex + 1) % total;
        goToSlide(next);
    }

    function startInit() {
        const hasPaywall = Boolean(document.querySelector('[data-paywall-root]'));
        if (hasPaywall) {
            scheduleInitWithIdle(init);
        } else {
            init();
        }

        // Start footer collision watcher
        initFooterObserver();
    }

    /**
     * Footer Collision Handling for Vertical Fixed Mode
     * Pushes the fixed carousel up when footer enters viewport
     */
    function initFooterObserver() {
        // Find the site footer specifically, not article-footer
        const footer = document.querySelector('.site-footer') || document.querySelector('footer:last-of-type');
        if (!footer) return;

        function updateCarouselPosition() {
            // Only active in vertical mode (desktop-wide)
            if (!isSideMode()) {
                // Reset if mode changes
                const carouselEl = document.querySelector('.bubble-carousel');
                if (carouselEl) carouselEl.style.bottom = '';
                return;
            }

            // Query carousel inside handler to ensure it's available after lazy init
            const carouselEl = document.querySelector('.bubble-carousel');
            if (!carouselEl) return;

            const footerRect = footer.getBoundingClientRect();
            const viewportHeight = window.innerHeight;

            // If footer is visible
            if (footerRect.top < viewportHeight) {
                const overlap = viewportHeight - footerRect.top;
                carouselEl.style.bottom = `${overlap}px`;
            } else {
                carouselEl.style.bottom = '0';
            }
        }

        // Listen to scroll and resize
        window.addEventListener('scroll', updateCarouselPosition, { passive: true });
        window.addEventListener('resize', updateCarouselPosition, { passive: true });

        // Call immediately and after a short delay (for layout stabilization)
        updateCarouselPosition();
        setTimeout(updateCarouselPosition, 100);
        setTimeout(updateCarouselPosition, 500);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startInit);
    } else {
        startInit();
    }
})();
