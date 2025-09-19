# Releases

This file explains the release process for RetroChallenges: manual release steps, CI behaviour, and troubleshooting notes for local builds. 

Manual release (recommended for maintainers)
1. Prepare a clean branch with your changes and open a PR targeting `main`.
2. Once the PR is approved and merged (merge commit), the merged-PR workflow will automatically build and create a release.
   - That workflow triggers only for PRs merged into `main`.

Manual (on-demand) release via Actions
1. Open the repository Actions tab and select "Manual Build and Release".
2. Click "Run workflow" and specify:
   - `ref` — branch or commit to build (default: `main`)
   - `tag` — optional release tag (if empty a `manual-<run_id>` tag will be created)
   - `name` — optional release name
   - `draft` / `prerelease` — booleans
3. The workflow builds on Windows/macOS/Linux and attaches `dist/**` to the created release.

CI notes
- The CI builds use `npm ci` and `npm run build` (which uses `electron-builder`).
- Artifacts are collected from the `dist/` directory for each OS runner and attached to the release.

Signing and secrets
- If you need code signing (macOS or Windows), add the necessary credentials as repository secrets and update `package.json` or `electron-builder` config to reference those secrets.
- Typical secrets:
  - `CSC_LINK` and `CSC_KEY_PASSWORD` (macOS / Windows code signing)
  - Windows certificate PKCS12 or other signing credentials

Local build troubleshooting (Windows)
- If `npm run build` fails with "A required privilege is not held by the client" when creating symlinks:
  - Move the repo out of OneDrive (e.g., `C:\Projects\RetroChallenges`) to avoid OneDrive file system interference.
  - Enable Developer Mode (Settings → For developers) so non-admin users can create symlinks.
  - Or run PowerShell as Administrator and run `npm run build`.

Other notes
- The `main.js` process watches `challenge_data.json` and POSTs completed challenge payloads to the configured webhook — changing the JSON shape will require corresponding updates in `main.js`.
- The repo uses `electron` as a devDependency (required by electron-builder); leave `electron` in `devDependencies`.

Questions or help
- If you'd like, I can add signing example configs or a sample GitHub Actions secrets page. I can also adapt the workflows to support different merge strategies (squash/rebase) if you use them.
