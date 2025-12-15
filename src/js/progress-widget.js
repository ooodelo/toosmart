/**
 * Progress Widget (Docking "Next" Button)
 * 
 * Logic:
 * 1. Button is initially fixed at the bottom of the screen.
 * 2. IntersectionObserver watches the .pw-slot element.
 * 3. When .pw-slot intersects the viewport (is visible):
 *    - The button is moved inside the slot (or styled to look like it).
 *    - We use a state class .is-docked on the button wrapper.
 */

export function initProgressWidget() {
    const slot = document.querySelector('.pw-slot');
    if (!slot) return;

    // Create the button if it doesn't exist
    let button = document.querySelector('.pw-button-container');
    if (!button) {
        button = document.createElement('div');
        button.className = 'pw-button-container';
        button.innerHTML = `
            <button class="pw-button" type="button">
                <span>Далее</span>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
            </button>
        `;
        document.body.appendChild(button);
    }

    // Observer options
    const options = {
        root: null, // viewport
        rootMargin: '0px',
        threshold: 0.1 // Trigger when even 1px of slot is visible
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Slot is visible -> Dock the button
                slot.appendChild(button);
                button.classList.add('is-docked');
            } else {
                // Slot is not visible -> Float the button
                // Only if we are ABOVE the slot (scrolling up) or if the slot is below viewport
                // Simple logic: if not intersecting, float it.
                // BUT: if we scrolled PAST the slot (e.g. into the footer), we might want it to stay docked?
                // Actually, usually "Next" button leads to next page, so it's the end of content.
                // If the user scrolls back up, it should float again.

                // We need to check bounding rect to know if we are above or below
                const rect = slot.getBoundingClientRect();
                if (rect.top > window.innerHeight) {
                    // Slot is below viewport -> Float
                    document.body.appendChild(button);
                    button.classList.remove('is-docked');
                }
            }
        });
    }, options);

    observer.observe(slot);
}
