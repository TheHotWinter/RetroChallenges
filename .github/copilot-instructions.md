Short instructions to help AI coding agents contribute to RetroChallenges (Electron app).

Key goals
- Preserve the Electron main/renderer separation in `main.js` and `index.html`.
- Prefer minimal, non-invasive changes that keep the app runnable with `npm start`.

Architecture (big picture)
- Electron app: `main.js` is the main process (IPC handlers, OAuth flow, launching EmuHawk, file-watchers).
- Renderer: `index.html` and `auth.html` contain UI + renderer-side scripts that call `ipcRenderer.invoke(...)` for actions (`authenticate`, `fetch-challenges`, `launch-challenge`, etc.).
- Challenge flow: Lua scripts in `scripts/` write JSON to `challenge_data.json`. `main.js` watches that file and forwards data to the configured webhook.

Important files to inspect
- `main.js` — core logic: OAuth (exchange/refresh), IPC handlers, launching EmuHawk, file watcher (`challenge_data.json`).
- `index.html`, `auth.html` — renderer UI and ipcRenderer usage; update UI only when confident about IPC contracts.
- `scripts/*.lua` — example challenge scripts; they output JSON that `main.js` expects (fields: `username`, `game`, `challengeName`, optional `date`).
- `config.example.json` / `config.json` — OAuth and challenges URL configuration.
- `package.json` — run/dev commands: `npm start` (dev), `npm run build` / `npm run dist` (electron-builder).

Developer workflows & checks
- Run locally: `npm install` then `npm start`. The app requires EmuHawk and valid OAuth config for full flows; however, `main.js` provides fallback/mock `challengesData` when the fetch fails — tests can rely on that.
- Packaging: uses `electron-builder`; `npm run build`/`npm run dist` create artifacts per OS. Avoid changing build keys unless packaging behavior must be updated.

Conventions & patterns specific to this repo
- IPC names are the contract between renderer and main — do not rename handlers without updating both sides. Common handlers: `authenticate`, `select-emuhawk`, `fetch-challenges`, `launch-challenge`, `get-user-info`, `logout`, `get-config`, `set-webhook-url`.
- Config is loaded from `config.json` at startup. If missing, `main.js` falls back to defaults. Editing `config.example.json` is preferred for documentation; do not commit secrets.
- Lua scripts should write a small JSON object to `challenge_data.json` with `username`, `game`, `challengeName` — `main.js` will add a `date` if missing and POST to the webhook.

Integration points & dependencies
- Google OAuth endpoints are used in `main.js`; tokens are persisted to `auth_data.json` in the repo root (for local testing). Be cautious if changing persistence logic.
- EmuHawk is launched via child_process.spawn using CLI args. The app stores the selected EmuHawk path in-memory (`APP_CONFIG.emuhawkPath`) and does not persist it — tests should mock `spawn` where appropriate.
- Outbound webhook: `APP_CONFIG.webhookUrl` — `main.js` posts completion payloads with `axios`.

Examples to reference when editing
- To add a new IPC handler: follow `registerIpcHandlers()` in `main.js` and call `ipcRenderer.invoke('<name>')` from `index.html`.
- To add a challenge: put ROM in `roms/`, add Lua script to `scripts/`, and add an entry in remote/local challenges JSON (`challenges.games[].challenges[].lua`).

Risk notes
- Do not commit client secrets to `config.json` or `auth_data.json`. Use `config.example.json` for documentation.
- Changing the shape of the JSON written by Lua scripts will require updating the file-watcher logic in `main.js`.

If unsure, open these files first: `main.js`, `index.html`, `scripts/*.lua`, `config.example.json`, `package.json`.

Ask the human: if you need credentials to exercise the OAuth flow, request them or run with mocked responses.
