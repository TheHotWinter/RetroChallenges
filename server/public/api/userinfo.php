<?php
// userinfo.php
session_start();

header('Content-Type: application/json');

if (isset($_SESSION['user'])) {
    echo json_encode(['success' => true, 'user' => $_SESSION['user']]);
} else {
    echo json_encode(['success' => false, 'error' => 'No authenticated user']);
}
