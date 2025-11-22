<?php
/**
 * Premium Version - Logout Handler
 * Выход из аккаунта
 */
session_start();
session_destroy();
setcookie('premium_access', '', [
    'expires' => time() - 3600,
    'path' => '/',
    'secure' => true,
    'httponly' => false,
    'samesite' => 'Strict'
]);
header('Location: index.php');
exit;
?>