# Google OAuth Setup Guide for RetroChallenges

This guide will help you set up Google OAuth authentication for the RetroChallenges app using the latest Google Cloud Console interface.

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Enter project name: "RetroChallenges"
4. Click "Create"

## Step 2: Skip API Enablement (Not Required)

**Good news!** For basic OAuth 2.0 authentication, you don't need to enable any specific APIs. Google OAuth 2.0 works out of the box for:
- User profile information
- Email address access
- Basic authentication

You can skip this step and go directly to creating OAuth credentials.

## Step 2: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client IDs"
3. Choose **"Desktop application"** as the application type
4. Give it a name: "RetroChallenges Desktop App"
5. Click "Create"
6. **IMPORTANT**: Download and securely store your Client Secret immediately - it will be masked after creation!

## Step 3: Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Choose **"External"** user type (unless you have a Google Workspace domain)
3. Fill in the required fields:
   - **App name**: "RetroChallenges"
   - **User support email**: your email address
   - **Developer contact information**: your email address
4. Add scopes by clicking "Add or Remove Scopes":
   - `../auth/userinfo.profile` (View your basic profile info)
   - `../auth/userinfo.email` (View your email address)
5. Add test users (your email address) in the "Test users" section
6. Save and continue through all steps

## Step 4: Update Configuration

1. **Copy your credentials** from the OAuth 2.0 Client ID page:
   - **Client ID**: Copy the full Client ID
   - **Client Secret**: Copy the full Client Secret (this is only shown once!)
2. Open `config.json` in your RetroChallenges folder
3. Replace the placeholder values:

```json
{
  "google": {
    "clientId": "YOUR_ACTUAL_CLIENT_ID_HERE.apps.googleusercontent.com",
    "clientSecret": "YOUR_ACTUAL_CLIENT_SECRET_HERE",
    "redirectUri": "http://localhost:8080/callback"
  },
  "challenges": {
    "url": "https://retrochallenges.com/challenges/challenges.json"
  }
}
```

**⚠️ Important**: Store your Client Secret securely - it will be masked in the Google Cloud Console after creation!

## Step 5: Test the Authentication

1. Run `npm start`
2. Click "Sign in with Google"
3. Complete the OAuth flow in the popup window
4. You should be authenticated and see the main app

## Troubleshooting

### "This app isn't verified"
- This is normal for development. Click **"Advanced"** → **"Go to RetroChallenges (unsafe)"**
- For production, you'll need to verify your app with Google (can take several days)

### "redirect_uri_mismatch"
- Make sure the redirect URI in your Google Console matches exactly: `http://localhost:8080/callback`
- Check that there are no trailing slashes or extra characters

### "invalid_client"
- Double-check your Client ID and Client Secret in `config.json`
- Make sure there are no extra spaces or characters
- Verify the Client ID ends with `.apps.googleusercontent.com`

### "access_denied"
- Check that you've added your email as a test user in the OAuth consent screen
- Make sure you're using the same email address for testing

### "Client Secret not found"
- If you lost your Client Secret, you'll need to create a new OAuth client
- Google now masks Client Secrets after creation for security

### "OAuth client automatically deleted"
- Google automatically deletes inactive OAuth clients after 6 months
- You'll receive notifications before deletion with a 30-day restoration window

## Security Notes

- **Never commit `config.json`** with real credentials to version control
- **Add `config.json` to your `.gitignore`** file (already done)
- **Store Client Secret securely** - it's only shown once during creation
- For production, use environment variables instead of a config file

## Production Considerations

For a production app, you'll need to:
1. **Verify your app with Google** (can take several days)
2. **Add proper error handling** and user feedback
3. **Implement token refresh** for long-running sessions
4. **Use environment variables** for credentials
5. **Add proper logging and monitoring**
6. **Consider OAuth 2.1** for enhanced security (when available)

## Latest Updates (2024-2025)

- **Google Auth Platform**: New dedicated section in Google Cloud Console
- **Client Secret Masking**: Secrets are now masked after creation for security
- **Automatic Deletion**: Inactive OAuth clients are deleted after 6 months
- **OAuth 2.1**: New version with enhanced security (recommended for new projects)
