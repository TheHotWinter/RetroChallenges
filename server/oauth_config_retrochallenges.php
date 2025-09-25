<?php
// config.php - keep this out of the webroot when possible
return [
  'google_client_id'     => 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
  'google_client_secret' => 'YOUR_GOOGLE_CLIENT_SECRET',
  'redirect_uri'  => 'https://retrochallenges.com/public/auth/google/callback.php',
  'google_redirect_uri'        => 'https://retrochallenges.com/public/auth/google/callback.php'
  ,
  // Optional database config for user provisioning (best set via environment variables)
  'db_host' => getenv('DB_HOST') ?: '127.0.0.1',
  'db_user' => getenv('DB_USER') ?: 'db_user',
  'db_pass' => getenv('DB_PASS') ?: 'db_pass',
  'db_name' => getenv('DB_NAME') ?: 'db_name'
];