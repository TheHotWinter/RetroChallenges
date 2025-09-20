<?php
// callback.php
session_start();

$config = require __DIR__ . '/../../config.php';

if (!isset($_GET['code']) || !isset($_GET['state'])) {
    http_response_code(400);
    echo 'Missing code or state';
    exit;
}

if (!isset($_SESSION['oauth2_state']) || $_GET['state'] !== $_SESSION['oauth2_state']) {
    http_response_code(400);
    echo 'Invalid state';
    exit;
}

$code = $_GET['code'];

$tokenUrl = 'https://oauth2.googleapis.com/token';

$postFields = http_build_query([
    'code' => $code,
    'client_id' => $config['google_client_id'],
    'client_secret' => $config['google_client_secret'],
    'redirect_uri' => $config['google_redirect_uri'],
    'grant_type' => 'authorization_code'
]);

$ch = curl_init($tokenUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);
$response = curl_exec($ch);
if ($response === false) {
    http_response_code(500);
    echo 'Token request failed';
    exit;
}

$tokenData = json_decode($response, true);
if (!$tokenData || !isset($tokenData['access_token'])) {
    http_response_code(500);
    echo 'Invalid token response';
    exit;
}

$accessToken = $tokenData['access_token'];

// Fetch userinfo
$userInfoUrl = 'https://www.googleapis.com/oauth2/v2/userinfo';
$ch = curl_init($userInfoUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $accessToken]);
$userResponse = curl_exec($ch);
if ($userResponse === false) {
    http_response_code(500);
    echo 'Userinfo request failed';
    exit;
}

$user = json_decode($userResponse, true);
if (!$user || !isset($user['email'])) {
    http_response_code(500);
    echo 'Invalid userinfo response';
    exit;
}

// Save minimal user info to session for the Electron app to fetch
$_SESSION['user'] = [
    'name' => $user['name'] ?? null,
    'email' => $user['email'],
    'id' => $user['id'] ?? null,
    'picture' => $user['picture'] ?? null,
];

// Render a simple page that contains the user JSON so an embedded browser can read it
?>
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>RetroChallenges - Authentication Successful</title>
  </head>
  <body>
    <h1>Authentication successful</h1>
    <p>You can close this window and return to the RetroChallenges app.</p>
    <script>
      // Embed the user JSON on the page for the Electron app to parse
      window.USER = <?php echo json_encode($_SESSION['user']); ?>;
      // Optionally notify opener (if present)
      if (window.opener && window.opener.postMessage) {
        window.opener.postMessage({ type: 'RETRO_AUTH_SUCCESS', user: window.USER }, '*');
      }
    </script>
  </body>
  </html>
