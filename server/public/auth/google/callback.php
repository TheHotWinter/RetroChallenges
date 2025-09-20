<?php
// callback.php
session_start();

$config = require __DIR__ . '/../../../../oauth_config_retrochallenges.php'; // adjust path as needed

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


// Trim config values to avoid accidental whitespace issues
$clientId = isset($config['google_client_id']) ? trim($config['google_client_id']) : '';
$clientSecret = isset($config['google_client_secret']) ? trim($config['google_client_secret']) : '';
$redirectUri = isset($config['google_redirect_uri']) ? trim($config['google_redirect_uri']) : '';

$postFieldsArr = [
  'code' => $code,
  'client_id' => $clientId,
  'client_secret' => $clientSecret,
  'redirect_uri' => $redirectUri,
  'grant_type' => 'authorization_code'
];

// Log which client_id and redirect_uri are being used (do NOT log client_secret)
error_log('Using client_id: ' . $clientId . ' redirect_uri: ' . $redirectUri);

$postFields = http_build_query($postFieldsArr);

$ch = curl_init($tokenUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);
$response = curl_exec($ch);

if ($response === false) {
  error_log('Token request curl error: ' . curl_error($ch));
  http_response_code(500);
  echo 'Token request failed (see server logs)';
  exit;
}

$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$tokenData = json_decode($response, true);

// Log token exchange response for debugging (do not expose client_secret)
error_log('Token exchange HTTP ' . $httpCode . ' response: ' . $response);

if ($httpCode !== 200 || !$tokenData || !isset($tokenData['access_token'])) {
  // Try to provide a helpful error to the developer in server logs
  $err = isset($tokenData['error']) ? json_encode($tokenData) : 'Unknown token error';
  error_log('Token exchange failed: ' . $err);
  http_response_code(500);
  echo 'Token exchange failed (see server logs)';
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
