<?php
/**
 * Premium Version - Logout Handler
 * Выход из аккаунта
 */
session_start();
session_destroy();
header('Location: index.php');
exit;
?>
