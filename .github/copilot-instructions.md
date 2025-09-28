Short, actionable instructions to help AI agents contribute to RetroChallenges (Electron app)

Overview
- Purpose: desktop helper for running retro-game challenges, launching EmuHawk with ROM+Lua, and reporting challenge completions to a webhook.
- Two-process architecture: main process (node) in `main.js` and renderer process UI in `index.html` / `auth.html`. Keep logic that accesses OS/files/child processes in `main.js`.

High-value files to read first
- `main.js` — app lifecycle, IPC handlers, OAuth flows, file watcher (reads/writes `challenge_data.json`), EmuHawk launcher (child_process.spawn).
- `index.html`, `auth.html` — renderer UI and calls to `ipcRenderer.invoke(...)` (match IPC names exactly).
- `server/` — optional server-side OAuth and helper PHP endpoints (if using https://retrochallenges.com host). Key path: `server/public/auth/google/`.
- `config.json` / `config.example.json` — runtime configuration. Secrets must not be committed.
- `package.json` — scripts: `npm start` (dev), `npm run dist` (packaging via electron-builder).
- `scripts/*.lua` — example challenge scripts that write `challenge_data.json` consumed by `main.js`.
- `server/db_schema/schema.dbml` — database schema definition.

Key architecture notes (why things are arranged this way)
- main process handles system concerns (file I/O, launching EmuHawk, IPC handlers). Renderer only manipulates UI and invokes IPC.
- Lua scripts are authored to run inside EmuHawk; they emit a small JSON payload to `challenge_data.json` which the main process watches and forwards to a webhook — this decouples emulator scripts from network logic.
- Runtime writable data must live outside the ASAR; `main.js` uses `app.getPath('userData')` for `challenge_data.json`, `auth_data.json`, and a writable `roms` folder.

IPC contract (exact names used by the UI)
- authenticate → starts authentication flow (now uses hosted server login URL when configured).
- select-emuhawk → file dialog to pick EmuHawk executable.
- fetch-challenges → returns challenges JSON (from remote URL in config or fallback mock data).
- launch-challenge (gameData, challengeData) → launches EmuHawk with ROM + Lua.
- select-rom-file → file dialog for ROMs.
- get-rom-path (romFileName) → returns local rom path when present.
- get-user-info → returns authenticated user object.
- logout → clears local auth.
- get-config / set-webhook-url → inspector/setter for `APP_CONFIG` values.

Configuration & secrets
- `main.js` reads `config.json` and supports environment overrides: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, CHALLENGES_URL, WEBHOOK_URL.
- Do NOT add secrets to git. Prefer `config.example.json` and set secrets via CI/host environment variables or private server config files.
- Server-side helper endpoints (if using hosted OAuth) include `debug.php` and `secret_presence.php` under `server/public/auth/google/` to verify deployed client_id and presence of secret.

Build / run / debug
- Dev: npm install; npm start — opens the Electron app (main process + renderer). Use `NODE_ENV=development` to open DevTools.
- Build/distribute: npm run dist (uses electron-builder). Keep `electron` in devDependencies for packaging.
- Common runtime pitfalls:
	- Do not write runtime files into the ASAR bundle — `app.getPath('userData')` is used intentionally.
	- When packaging, ensure `electron-builder` includes non-code assets you need (scripts, assets) and that secrets are injected at runtime (not baked into artifacts unless intentionally).

Integration patterns & debugging tips
- EmuHawk: `main.js` uses `spawn(APP_CONFIG.emuhawkPath, args)`; tests should mock `spawn` if they can't start EmuHawk.
- Challenge JSON: Lua scripts must write { username, game, challengeName, (optional) date } to `challenge_data.json`. `main.js` will add a `date` and POST to `APP_CONFIG.webhookUrl`.
- OAuth: repo includes a server-side PHP option. If you see `invalid_client` during token exchange, verify `server/config.php` or the host env variables, exact redirect URI in Google Console, and use the `debug.php` / `secret_presence.php` endpoints.
- Logs: main process console logs appear in the terminal when running `npm start`. Server error_log is key for token exchange errors.

Editing guidance for AI agents
- Make small, local changes first. Run `npm start` to validate UI + IPC quickly.
- When changing IPC names, update both renderer and `registerIpcHandlers()` in `main.js`.
- When modifying OAuth or credentials handling, prefer adding env-var based configuration and small debug endpoints rather than hard-coding secrets.
- Preserve the separation of concerns: keep OS-level operations in `main.js` and UI in renderer files.

If you need more context, open these files first: `main.js`, `index.html`, `auth.html`, `package.json`, `config.example.json`, and `server/public/auth/google/*`.

Ask the human for missing credentials or permission to deploy server files when necessary.
