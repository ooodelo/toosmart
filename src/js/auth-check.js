/**
 * Auth Check
 * Redirects logged-in users from the free index page to the premium index page.
 */
(function () {
    // Only run on the root index page (free version)
    const path = window.location.pathname;
    if (path === '/' || path === '/index.html') {
        // Check for the premium_access cookie
        if (document.cookie.split(';').some((item) => item.trim().startsWith('premium_access=1'))) {
            // Redirect to premium area
            window.location.replace('/premium/');
        }
    }
})();
