<?php
// secret_presence.php - returns whether google_client_secret appears configured
$config = require __DIR__ . '/../../../../oauth_config_retrochallenges.php'; // adjust path as needed
header('Content-Type: application/json');

$secret = isset($config['google_client_secret']) ? trim($config['google_client_secret']) : '';
$hasSecret = ($secret !== '' && $secret !== 'YOUR_GOOGLE_CLIENT_SECRET');

echo json_encode(['has_client_secret' => $hasSecret], JSON_PRETTY_PRINT);
