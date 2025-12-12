/**
 * Bubble Carousel - Transform-Based Infinite Implementation
 * 
 * Modes:
 * - Horizontal (mobile/tablet/desktop): Transform-based infinite scroll
 * - Vertical (desktop-wide): Shows 2 cards at a time with pair cycling
 * 
 * Features:
 * - No native scroll - pure transform-based
 * - Infinite loop in both directions
 * - Touch/swipe support
 * - Autoplay with pause on interaction
 * - Handles odd number of cards for pair display
 */

(function () {
    'use strict';

    const RECOMMENDATIONS_URL = '/shared/recommendations.json';
    const AUTOPLAY_INTERVAL = 4000;
    const PAYWALL_IDLE_DELAY = 600;
    const SWIPE_THRESHOLD = 50;  // Min swipe distance in px
    const ANIMATION_DURATION = 300;  // Transition duration in ms

    // DOM elements
    let carousel = null;
    let track = null;
    let dotsContainer = null;

    // State
    let cardsData = [];
    let currentIndex = 0;
    let autoplayTimer = null;
    let isPaused = false;
    let isAnimating = false;
    let isVerticalMode = false;

    // Touch state
    let touchStartX = 0;
    let touchStartY = 0;
    let touchDeltaX = 0;
    let isSwiping = false;

    function scheduleInitWithIdle(fn) {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(fn, { timeout: 1000 });
            return;
        }
        setTimeout(fn, PAYWALL_IDLE_DELAY);
    }

    /**
     * Get current mode from body[data-mode] attribute
     */
    function getCurrentMode() {
        return document.body.getAttribute('data-mode') || 'desktop';
    }

    /**
     * Check if current mode is vertical (side column)
     */
    function isSideMode() {
        return getCurrentMode() === 'desktop-wide';
    }

    /**
     * Get number of cards visible at once
     */
    function getVisibleCount() {
        return isSideMode() ? 2 : 1;
    }

    /**
     * Get total number of "pages" (pairs or singles)
     */
    function getTotalPages() {
        if (cardsData.length === 0) return 0;
        if (isSideMode()) {
            // In pair mode, we cycle through all cards, showing 2 at a time
            // This creates cardsData.length pages (each starting from a different index)
            return cardsData.length;
        }
        return cardsData.length;
    }

    /**
     * Get card(s) for the given page index
     * In vertical mode, returns 2 cards (second wraps around if odd)
     */
    function getCardsForPage(pageIndex) {
        const total = cardsData.length;
        if (total === 0) return [];

        const idx = ((pageIndex % total) + total) % total;

        if (isSideMode()) {
            // Return pair: current and next (wrapping)
            const idx2 = ((idx + 1) % total);
            return [cardsData[idx], cardsData[idx2]];
        }
        return [cardsData[idx]];
    }

    /**
     * Initialize the bubble carousel
     */
    function init() {
        carousel = document.querySelector('.bubble-carousel');
        if (!carousel) return;

        track = carousel.querySelector('[data-carousel-track]');
        dotsContainer = carousel.querySelector('[data-carousel-dots]');
        if (!track) return;

        // Detect initial mode
        isVerticalMode = isSideMode();

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
                renderCurrentPage();
                startAutoplay();
            })
            .catch(() => {
                cardsData = fallbackData;
                renderCurrentPage();
                startAutoplay();
            });

        // Setup event listeners
        setupEventListeners();

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
     * Setup all event listeners
     */
    function setupEventListeners() {
        // Pause on hover
        carousel.addEventListener('mouseenter', pauseAutoplay);
        carousel.addEventListener('mouseleave', resumeAutoplay);

        // Touch events for swipe
        track.addEventListener('touchstart', onTouchStart, { passive: true });
        track.addEventListener('touchmove', onTouchMove, { passive: false });
        track.addEventListener('touchend', onTouchEnd);

        // Mouse drag support
        track.addEventListener('mousedown', onMouseDown);
    }

    /**
     * Update mode when body[data-mode] changes
     */
    function updateMode() {
        const wasVertical = isVerticalMode;
        isVerticalMode = isSideMode();

        if (wasVertical !== isVerticalMode) {
            currentIndex = 0;
            renderCurrentPage();
            renderDots();
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
     * Render current page cards
     */
    function renderCurrentPage() {
        if (!track || cardsData.length === 0) {
            if (carousel) carousel.classList.add('is-hidden');
            return;
        }

        carousel.classList.remove('is-hidden');
        track.innerHTML = '';

        const cards = getCardsForPage(currentIndex);
        cards.forEach((cardData, i) => {
            const element = createCardElement(cardData, i);
            track.appendChild(element);
        });

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

        if (isLink) {
            element.href = card.url;
        }

        element.innerHTML = `
            <div class="bubble-card__content">
                <span class="bubble-card__emoji">${card.emoji || '📋'}</span>
                <h3 class="bubble-card__title">${card.title || ''}</h3>
                <p class="bubble-card__desc">${card.description || ''}</p>
            </div>
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

        const total = getTotalPages();
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
                goToPage(i);
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
        const normalizedIndex = ((currentIndex % cardsData.length) + cardsData.length) % cardsData.length;

        dots.forEach((dot, i) => {
            if (i === normalizedIndex) {
                dot.setAttribute('aria-current', 'true');
                dot.classList.add('is-active');
            } else {
                dot.removeAttribute('aria-current');
                dot.classList.remove('is-active');
            }
        });
    }

    /**
     * Go to specific page with animation
     */
    function goToPage(pageIndex, direction = 0) {
        if (isAnimating || cardsData.length === 0) return;

        const total = cardsData.length;
        const newIndex = ((pageIndex % total) + total) % total;

        if (newIndex === currentIndex && direction === 0) return;

        isAnimating = true;

        // Determine animation direction
        const animDir = direction !== 0 ? direction : (newIndex > currentIndex ? 1 : -1);

        // Animate out current cards
        const currentCards = track.querySelectorAll('.bubble-card');
        currentCards.forEach(card => {
            card.style.transition = `transform ${ANIMATION_DURATION}ms ease-out, opacity ${ANIMATION_DURATION}ms ease-out`;
            card.style.transform = `translateX(${-animDir * 100}%)`;
            card.style.opacity = '0';
        });

        setTimeout(() => {
            // Update index and render new cards
            currentIndex = newIndex;
            track.innerHTML = '';

            const newCards = getCardsForPage(currentIndex);
            newCards.forEach((cardData, i) => {
                const element = createCardElement(cardData, i);
                // Start from opposite side
                element.style.transform = `translateX(${animDir * 100}%)`;
                element.style.opacity = '0';
                track.appendChild(element);
            });

            // Force reflow
            track.offsetHeight;

            // Animate in
            requestAnimationFrame(() => {
                track.querySelectorAll('.bubble-card').forEach(card => {
                    card.style.transition = `transform ${ANIMATION_DURATION}ms ease-out, opacity ${ANIMATION_DURATION}ms ease-out`;
                    card.style.transform = 'translateX(0)';
                    card.style.opacity = '1';
                });
            });

            updateDots();

            setTimeout(() => {
                // Clean up transitions
                track.querySelectorAll('.bubble-card').forEach(card => {
                    card.style.transition = '';
                    card.style.transform = '';
                    card.style.opacity = '';
                });
                isAnimating = false;
            }, ANIMATION_DURATION);
        }, ANIMATION_DURATION);
    }

    /**
     * Go to next page
     */
    function nextPage() {
        goToPage(currentIndex + 1, 1);
    }

    /**
     * Go to previous page
     */
    function prevPage() {
        goToPage(currentIndex - 1, -1);
    }

    // ========================================
    // Touch/Swipe handling
    // ========================================

    function onTouchStart(e) {
        if (isAnimating) return;
        pauseAutoplay();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchDeltaX = 0;
        isSwiping = false;
    }

    function onTouchMove(e) {
        if (isAnimating) return;

        const deltaX = e.touches[0].clientX - touchStartX;
        const deltaY = e.touches[0].clientY - touchStartY;

        // Only swipe if horizontal movement is greater than vertical
        if (!isSwiping && Math.abs(deltaX) > 10) {
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                isSwiping = true;
            }
        }

        if (isSwiping) {
            e.preventDefault();  // Prevent page scroll
            touchDeltaX = deltaX;

            // Visual feedback during swipe
            const progress = Math.min(Math.abs(deltaX) / 100, 1);
            track.querySelectorAll('.bubble-card').forEach(card => {
                card.style.transform = `translateX(${deltaX * 0.3}px)`;
                card.style.opacity = String(1 - progress * 0.2);
            });
        }
    }

    function onTouchEnd() {
        resumeAutoplay();

        if (!isSwiping) return;
        isSwiping = false;

        // Reset card positions
        track.querySelectorAll('.bubble-card').forEach(card => {
            card.style.transform = '';
            card.style.opacity = '';
        });

        // Determine if swipe was significant
        if (Math.abs(touchDeltaX) > SWIPE_THRESHOLD) {
            if (touchDeltaX < 0) {
                nextPage();  // Swipe left = next
            } else {
                prevPage();  // Swipe right = prev
            }
        }

        touchDeltaX = 0;
    }

    // Mouse drag support
    let isMouseDown = false;
    let mouseStartX = 0;

    function onMouseDown(e) {
        if (isAnimating) return;
        isMouseDown = true;
        mouseStartX = e.clientX;
        pauseAutoplay();
        e.preventDefault();

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    function onMouseMove(e) {
        if (!isMouseDown) return;
        const deltaX = e.clientX - mouseStartX;
        touchDeltaX = deltaX;

        const progress = Math.min(Math.abs(deltaX) / 100, 1);
        track.querySelectorAll('.bubble-card').forEach(card => {
            card.style.transform = `translateX(${deltaX * 0.3}px)`;
            card.style.opacity = String(1 - progress * 0.2);
        });
    }

    function onMouseUp() {
        if (!isMouseDown) return;
        isMouseDown = false;
        resumeAutoplay();

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // Reset positions
        track.querySelectorAll('.bubble-card').forEach(card => {
            card.style.transform = '';
            card.style.opacity = '';
        });

        if (Math.abs(touchDeltaX) > SWIPE_THRESHOLD) {
            if (touchDeltaX < 0) {
                nextPage();
            } else {
                prevPage();
            }
        }

        touchDeltaX = 0;
    }

    // ========================================
    // Autoplay
    // ========================================

    function startAutoplay() {
        stopAutoplay();
        if (cardsData.length <= 1) return;

        autoplayTimer = setInterval(() => {
            if (!isPaused && !isAnimating) {
                nextPage();
            }
        }, AUTOPLAY_INTERVAL);
    }

    function stopAutoplay() {
        if (autoplayTimer) {
            clearInterval(autoplayTimer);
            autoplayTimer = null;
        }
    }

    function pauseAutoplay() {
        isPaused = true;
    }

    function resumeAutoplay() {
        isPaused = false;
    }

    // ========================================
    // Initialization
    // ========================================

    function startInit() {
        const hasPaywall = Boolean(document.querySelector('[data-paywall-root]'));
        if (hasPaywall) {
            scheduleInitWithIdle(init);
        } else {
            init();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startInit);
    } else {
        startInit();
    }
})();
