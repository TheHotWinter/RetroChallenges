How to store sensitive configuration (client IDs, secrets, webhook URLs)

Use GitHub repository secrets for CI and workflow builds, and environment variables for local development.

1) Add repository secrets (recommended for CI)
- Go to your repository on GitHub → Settings → Secrets and variables → Actions → New repository secret.
- Add the following secrets (example names):
  - `GOOGLE_CLIENT_ID` — your OAuth client id
  - `GOOGLE_CLIENT_SECRET` — your OAuth client secret
  - `GOOGLE_REDIRECT_URI` — (optional) redirect URI
  - `CHALLENGES_URL` — (optional) remote challenges JSON URL
  - `WEBHOOK_URL` — (optional) webhook used by the packaged app

2) Reference secrets in GitHub Actions workflows
- In a workflow, pass them as environment variables or inputs. Example snippet:

```yaml
jobs:
  build:
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Build
        env:
          GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
          GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
          CHALLENGES_URL: ${{ secrets.CHALLENGES_URL }}
        run: npm run dist
```

3) Local development
- On Windows PowerShell you can set environment variables for a session:
```powershell
$env:GOOGLE_CLIENT_ID = 'your-client-id'
$env:GOOGLE_CLIENT_SECRET = 'your-client-secret'
npm start
```

4) Why this repository change helps
- `main.js` now reads from environment variables (`process.env.*`) if present, so you don't need to commit secrets to `config.json`. CI workflows or local shells can provide secrets securely.
