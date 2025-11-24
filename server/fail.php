<?php
/**
 * Robokassa Fail URL
 * Redirects to the main app (or referrer) with a query param to open the fail modal.
 */

// Redirect to home with fail flag
header('Location: /?payment=fail');
exit;