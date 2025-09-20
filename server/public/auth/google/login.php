<?php
// public/auth/google/login.php
session_start();
$config = require __DIR__ . '/../../../../oauth_config_retrochallenges.php'; // adjust path as needed

// Generate a random state for CSRF protection
$state = bin2hex(random_bytes(16));
$_SESSION['oauth_state'] = $state;

// optional: remember where to return after login
$_SESSION['post_login_redirect'] = '/'; // or where you want to send user

$params = [
  'client_id'     => $config['client_id'],
  'redirect_uri'  => $config['redirect_uri'],
  'response_type' => 'code',
  'scope'         => $config['scopes'],
  'access_type'   => 'offline',   // request refresh token
  'prompt'        => 'consent',   // optional; forces refresh token consent
  'state'         => $state
];

$authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params);
header('Location: ' . $authUrl);
exit;