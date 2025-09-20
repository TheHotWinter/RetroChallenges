<?php
// public/auth/google/login.php
// Start server-side OAuth by redirecting to Google's authorization endpoint.
session_start();

// Use the repository config which exposes google_client_id and google_redirect_uri
$config = require __DIR__ . '/../../../../oauth_config_retrochallenges.php'; // adjust path as needed

// Generate a random state for CSRF protection
$state = bin2hex(random_bytes(16));
// Store under oauth2_state (callback.php expects this name)
$_SESSION['oauth2_state'] = $state;

// optional: remember where to return after login
$_SESSION['post_login_redirect'] = '/';

$scope = isset($config['scopes']) ? $config['scopes'] : 'openid email profile';

$params = [
  'client_id'     => $config['google_client_id'],
  'redirect_uri'  => $config['google_redirect_uri'],
  'response_type' => 'code',
  'scope'         => $scope,
  'access_type'   => 'offline',   // request refresh token
  'prompt'        => 'consent',   // optional; forces refresh token consent
  'state'         => $state
];

$authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params);
header('Location: ' . $authUrl);
exit;