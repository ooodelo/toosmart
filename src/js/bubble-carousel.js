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

    // Infinite scroll constants
    const CLONE_COUNT = 3;
    const GAP = 16;  // from CSS --bubble-gap-mobile

    /**
     * Get card total (width + gap) dynamically from DOM
     * Supports different card widths for mobile (70vw) vs desktop (280px)
     */
    function getCardTotal() {
        const card = track?.querySelector('.bubble-card');
        if (!card) return 276; // fallback: 260 + 16
        const cardWidth = card.offsetWidth || 260;
        return cardWidth + GAP;
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
    function checkIsHorizontal() {
        const mode = getCurrentMode();
        // Horizontal scroll for mobile, tablet, and regular desktop (inline below content)
        // Vertical stack only for desktop-wide (fixed right column)
        return mode !== 'desktop-wide';
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
            scrollWrapper.addEventListener('scroll', handleScroll, { passive: true });
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
     * Create a single card element
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

        element.innerHTML = `
            <span class="bubble-card__emoji">${card.emoji || '📋'}</span>
            <h3 class="bubble-card__title">${card.title || ''}</h3>
            <p class="bubble-card__desc">${card.description || ''}</p>
            <svg class="bubble-card__tail" width="60" height="13" viewBox="0 0 60 13">
                <path d="M0 0 C20 0 20 13 30 13 C40 13 40 0 60 0 Z" fill="#ffffff"/>
            </svg>
        `;

        return element;
    }

    /**
     * Render dot navigation
     */
    function renderDots() {
        if (!dotsContainer) return;
        dotsContainer.innerHTML = '';

        // Desktop: dots = number of slides (pairs of 2)
        // Mobile: dots = original cards count
        const total = isHorizontal ? cardsData.length : Math.ceil(cardsData.length / 2);

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
            // Mobile: scroll to card position
            currentIndex = index;
            updateDots();
            scrollToCard(index, true);
        } else {
            // Desktop: update visible cards
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

        // Calculate which 2 card indices should be visible
        const idx1 = (currentIndex * 2) % total;        // First card
        const idx2 = (currentIndex * 2 + 1) % total;    // Second card

        // Reorder DOM: move visible cards to first two positions
        // This works with CSS :nth-child(n+3) { display: none }
        const cardArray = Array.from(cards);
        const card1 = cardArray[idx1];
        const card2 = cardArray[idx2];

        if (card1 && card2) {
            // Clear track and re-add in correct order
            track.innerHTML = '';
            track.appendChild(card1);
            track.appendChild(card2);

            // Re-add remaining cards (they will be hidden by CSS)
            cardArray.forEach((card, i) => {
                if (i !== idx1 && i !== idx2) {
                    track.appendChild(card);
                }
            });
        }
    }

    /**
     * Handle scroll event (mobile mode) - with teleportation for infinite loop
     * React template lines 239-269
     */
    function handleScroll() {
        if (!isHorizontal || !track || isScrolling) return;

        const scrollLeft = scrollWrapper.scrollLeft;
        const totalOriginal = cardsData.length;

        // Calculate real index accounting for clones
        const rawIndex = Math.round(scrollLeft / getCardTotal());
        const adjustedIndex = rawIndex - CLONE_COUNT;
        const realIndex = ((adjustedIndex % totalOriginal) + totalOriginal) % totalOriginal;

        if (realIndex !== currentIndex) {
            currentIndex = realIndex;
            updateDots();
        }

        // Infinite scroll: teleport when reaching clone boundaries
        // When scrolling left: teleport forward when reaching first clone
        // When scrolling right: teleport backward when reaching last clone
        const cardTotal = getCardTotal();
        const minScroll = cardTotal * 1;  // After first clone
        const maxScroll = cardTotal * (CLONE_COUNT + totalOriginal);  // Before last clone ends

        if (scrollLeft <= minScroll) {
            isScrolling = true;
            scrollWrapper.scrollLeft = scrollLeft + (totalOriginal * cardTotal);
            setTimeout(() => { isScrolling = false; }, 50);
        } else if (scrollLeft >= maxScroll) {
            isScrolling = true;
            scrollWrapper.scrollLeft = scrollLeft - (totalOriginal * cardTotal);
            setTimeout(() => { isScrolling = false; }, 50);
        }
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
        const total = isHorizontal ? cardsData.length : Math.ceil(cardsData.length / 2);
        const next = (currentIndex + 1) % total;
        goToSlide(next);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
