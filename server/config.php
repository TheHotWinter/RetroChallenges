<?php
// Configuration for Google OAuth server-side example
// IMPORTANT: Do NOT commit real client secrets to public repositories.
// Set these values on your server environment or edit this file privately.
return [
    'google_client_id' => 'YOUR_GOOGLE_CLIENT_ID',
    'google_client_secret' => 'YOUR_GOOGLE_CLIENT_SECRET',
    // Must match the authorized redirect URI configured in Google Console
    'google_redirect_uri' => 'https://retrochallenges.com/public/auth/google/callback.php',
];
