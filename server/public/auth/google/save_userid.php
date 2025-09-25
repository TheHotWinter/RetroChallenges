<?php
// save_userid.php - updates users.rc_userid for the logged-in session user
session_start();

header('Content-Type: application/json');

$config = require __DIR__ . '/../../../../oauth_config_retrochallenges.php';

if (!isset($_SESSION['user']) || !isset($_SESSION['user']['id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Not authenticated']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!isset($data['rc_userid'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing rc_userid']);
    exit;
}

$rc_userid = trim($data['rc_userid']);
if ($rc_userid === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Empty rc_userid']);
    exit;
}

try {
    $dsn = 'mysql:host=' . ($config['db_host'] ?? '127.0.0.1') . ';dbname=' . $config['db_name'] . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

    $update = $pdo->prepare('UPDATE users SET rc_userid = :rc_userid WHERE oauth_id = :oauth_id');
    $update->bindValue(':rc_userid', $rc_userid, PDO::PARAM_STR);
    $update->bindValue(':oauth_id', (string)$_SESSION['user']['id'], PDO::PARAM_STR);
    $update->execute();

    // Update session copy
    $_SESSION['user']['rc_userid'] = $rc_userid;

    echo json_encode(['success' => true]);
} catch (Exception $e) {
    error_log('save_userid DB error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'DB error']);
}
