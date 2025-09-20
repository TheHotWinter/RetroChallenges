<?php
// debug.php - shows non-secret config for debugging deployments
$config = require __DIR__ . '/../../../../oauth_config_retrochallenges.php'; // adjust path as needed
header('Content-Type: application/json');
echo json_encode([
    'google_client_id' => $config['google_client_id'] ?? null,
    'google_redirect_uri' => $config['google_redirect_uri'] ?? null
], JSON_PRETTY_PRINT);
