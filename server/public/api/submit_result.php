<?php
// submit_result.php
session_start();

header('Content-Type: application/json');

$config = require __DIR__ . '/../../../../oauth_config_retrochallenges.php';

 Check for authenticated user in session (optional, but good practice)
 if (!isset($_SESSION['user']) || !isset($_SESSION['user']['id'])) {
     http_response_code(401);
     echo json_encode(['success' => false, 'error' => 'Not authenticated']);
     exit;
 }

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

// Input validation
$requiredFields = ['oauth_id', 'rc_username', 'game', 'challengeName'];
foreach ($requiredFields as $field) {
    if (!isset($data[$field]) || trim($data[$field]) === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Missing or empty field: ' . $field]);
        exit;
    }
}

$oauth_id = $data['oauth_id'];
$rc_username = $data['rc_username'];
$game = $data['game'];
$challengeName = $data['challengeName'];
$score = $data['score'] ?? null;
$time = $data['time'] ?? null;

if ($score === null && $time === null) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Either score or time must be provided']);
    exit;
}

try {
    $dsn = 'mysql:host=' . ($config['db_host'] ?? '127.0.0.1') . ';dbname=' . $config['db_name'] . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

    // 1. Verify user and get user_id
    $stmt = $pdo->prepare('SELECT id FROM users WHERE oauth_id = :oauth_id AND rc_userid = :rc_userid LIMIT 1');
    $stmt->bindValue(':oauth_id', (string)$oauth_id, PDO::PARAM_STR);
    $stmt->bindValue(':rc_userid', $rc_username, PDO::PARAM_STR);
    $stmt->execute();
    $userRow = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$userRow) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Invalid user credentials']);
        exit;
    }
    $user_id = $userRow['id'];

    // 2. Get challenge_id
    $stmt = $pdo->prepare('SELECT id FROM challenges WHERE game = :game AND challenge = :challenge LIMIT 1');
    $stmt->bindValue(':game', $game, PDO::PARAM_STR);
    $stmt->bindValue(':challenge', $challengeName, PDO::PARAM_STR);
    $stmt->execute();
    $challengeRow = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$challengeRow) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Challenge not found']);
        exit;
    }
    $challenge_id = $challengeRow['id'];

    // 3. Insert result
    $insert = $pdo->prepare(
        'INSERT INTO results (user_id, challenge_id, score, time, earns_points) VALUES (:user_id, :challenge_id, :score, :time, NULL)'
    );
    $insert->bindValue(':user_id', $user_id, PDO::PARAM_INT);
    $insert->bindValue(':challenge_id', $challenge_id, PDO::PARAM_INT);
    $insert->bindValue(':score', $score, PDO::PARAM_STR); // Use PARAM_STR for float or null
    $insert->bindValue(':time', $time, PDO::PARAM_STR); // Use PARAM_STR for varchar or null
    $insert->execute();

    echo json_encode(['success' => true, 'message' => 'Result submitted successfully']);

} catch (Exception $e) {
    error_log('Submit result DB error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'DB error: ' . $e->getMessage()]);
}

?>