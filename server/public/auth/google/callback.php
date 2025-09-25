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

// Optional: provision user into MySQL `users` table if configured
try {
  if (!empty($config['db_name']) && !empty($config['db_user'])) {
    $dsn = 'mysql:host=' . ($config['db_host'] ?? '127.0.0.1') . ';dbname=' . $config['db_name'] . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

    // Fetch oauth_id and rc_userid (if any)
    $stmt = $pdo->prepare('SELECT oauth_id, rc_userid FROM users WHERE oauth_id = :oauth_id LIMIT 1');
    $stmt->bindValue(':oauth_id', (string)$user['id'], PDO::PARAM_STR);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($row) {
      // Attach rc_userid to session payload (may be NULL)
      $_SESSION['user']['rc_userid'] = isset($row['rc_userid']) ? $row['rc_userid'] : null;
      error_log('User exists, oauth_id: ' . $user['id'] . ' rc_userid: ' . ($_SESSION['user']['rc_userid'] ?? 'NULL'));
    } else {
      // Insert new user with NULL rc_userid
      $insert = $pdo->prepare('INSERT INTO users (oauth_id, oauth_source, rc_userid) VALUES (:oauth_id, :source, NULL)');
      $insert->bindValue(':oauth_id', (string)$user['id'], PDO::PARAM_STR);
      $insert->bindValue(':source', 'google', PDO::PARAM_STR);
      $insert->execute();
      $_SESSION['user']['rc_userid'] = null;
      error_log('Provisioned new user with oauth_id: ' . $user['id']);
      if (strlen((string)$user['id']) > 20) {
        error_log('Warning: oauth_id length is ' . strlen((string)$user['id']) . ". Ensure `users.oauth_id` is VARCHAR(64) not INT/BIGINT.");
      }
    }
  }
} catch (Exception $e) {
  // Log DB errors but continue; do not expose DB details to the user
  error_log('User provisioning DB error: ' . $e->getMessage());
}

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

        // If rc_userid is not set, show a small form to collect it and POST to save_userid.php
        (function() {
          function el(html) {
            const div = document.createElement('div');
            div.innerHTML = html.trim();
            return div.firstChild;
          }

          const container = document.createElement('div');
          container.id = 'rc-userid-container';
          container.style.margin = '16px';
          container.style.fontFamily = 'sans-serif';

          const info = el('<div id="rc-user-info"></div>');
          container.appendChild(info);

          const formHtml = `
            <form id="rc-userid-form" style="margin-top:8px;">
              <label for="rc_userid">Choose your RetroChallenges user id:</label><br/>
              <input id="rc_userid" name="rc_userid" type="text" placeholder="your-id" maxlength="64" style="padding:6px;margin-top:4px;width:220px;" />
              <button id="rc_userid_submit" type="submit" style="margin-left:8px;padding:6px;">Save</button>
              <div id="rc_userid_message" style="margin-top:8px;color:green;display:none;"></div>
            </form>`;

          const formNode = el(formHtml);
          container.appendChild(formNode);

          document.body.appendChild(container);

          const message = document.getElementById('rc_userid_message');
          const rcInfo = document.getElementById('rc-user-info');

          function setInfo(text) { rcInfo.textContent = text; }

          // Display current user info
          setInfo('Signed in as: ' + (window.USER.name || window.USER.email || 'Unknown'));

          // If rc_userid already set, hide form and show it
          if (window.USER.rc_userid) {
            formNode.style.display = 'none';
            const p = document.createElement('div');
            p.style.marginTop = '8px';
            p.textContent = 'RetroChallenges user id: ' + window.USER.rc_userid;
            container.appendChild(p);
            return;
          }

          // Otherwise wire up the form
          formNode.addEventListener('submit', async function(e) {
            e.preventDefault();
            message.style.display = 'none';
            const input = document.getElementById('rc_userid');
            const val = input.value.trim();
            if (!val) {
              message.style.display = 'block';
              message.style.color = 'red';
              message.textContent = 'Please enter a user id.';
              return;
            }
            if (val.length > 64) {
              message.style.display = 'block';
              message.style.color = 'red';
              message.textContent = 'User id too long (max 64 chars).';
              return;
            }

            try {
              const resp = await fetch('save_userid.php', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rc_userid: val })
              });
              const data = await resp.json();
              if (data && data.success) {
                message.style.display = 'block';
                message.style.color = 'green';
                message.textContent = 'Saved! You can close this window and return to the app.';
                window.USER.rc_userid = val;
                formNode.style.display = 'none';
              } else {
                throw new Error(data && data.error ? data.error : 'Unknown error');
              }
            } catch (err) {
              message.style.display = 'block';
              message.style.color = 'red';
              message.textContent = 'Save failed: ' + err.message;
              console.error('save_userid error', err);
            }
          });
        })();
    </script>
  </body>
  </html>
