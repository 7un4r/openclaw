---
summary: "Updating NightClaw safely (global install or source), plus rollback strategy"
read_when:
  - Updating OpenClaw
  - Something breaks after an update
title: "Updating"
---

# Updating

OpenClaw is moving fast (pre “1.0”). Treat updates like shipping infra: update → run checks → restart (or use `openclaw update`, which restarts) → verify.

## Recommended: reinstall from the NightClaw git repo

The **preferred** update path is to reinstall directly from the NightClaw GitHub
repository. This always pulls the latest patched NightClaw code:

```bash
npm install -g github:r1skarctic/nightclaw
```

Or with pnpm:

```bash
pnpm add -g github:r1skarctic/nightclaw
```

Notes:

- The install will detect your existing `~/.nightclaw` instance and migrate it automatically.
- For **source installs** (git checkout), pull the latest changes instead:

  ```bash
  cd /path/to/nightclaw
  git pull --rebase
  pnpm install
  pnpm build
  nightclaw doctor
  ```

- Legacy note: `clawdbot` remains available as a compatibility shim.

## Before you update

- Know how you installed: **global** (npm/pnpm) vs **from source** (git clone).
- Know how your Gateway is running: **foreground terminal** vs **supervised service** (launchd/systemd).
- Snapshot your tailoring:
  - Config: `~/.nightclaw/openclaw.json`
  - Credentials: `~/.nightclaw/credentials/`
  - Workspace: `~/.nightclaw/workspace`

## Update (global install)

Reinstall from the NightClaw repository (pick one):

```bash
npm install -g github:r1skarctic/nightclaw
```

```bash
pnpm add -g github:r1skarctic/nightclaw
```

We do **not** recommend Bun for the Gateway runtime (WhatsApp/Telegram bugs).

To switch update channels (git + npm installs):

```bash
openclaw update --channel beta
openclaw update --channel dev
openclaw update --channel stable
```

Use `--tag <dist-tag|version>` for a one-off install tag/version.

See [Development channels](/install/development-channels) for channel semantics and release notes.

Note: on npm installs, the gateway logs an update hint on startup (checks the current channel tag). Disable via `update.checkOnStart: false`.

### Core auto-updater (optional)

Auto-updater is **off by default** and is a core Gateway feature (not a plugin).

```json
{
  "update": {
    "channel": "stable",
    "auto": {
      "enabled": true,
      "stableDelayHours": 6,
      "stableJitterHours": 12,
      "betaCheckIntervalHours": 1
    }
  }
}
```

Behavior:

- `stable`: when a new version is seen, OpenClaw waits `stableDelayHours` and then applies a deterministic per-install jitter in `stableJitterHours` (spread rollout).
- `beta`: checks on `betaCheckIntervalHours` cadence (default: hourly) and applies when an update is available.
- `dev`: no automatic apply; use manual `openclaw update`.

Use `openclaw update --dry-run` to preview update actions before enabling automation.

Then:

```bash
openclaw doctor
openclaw gateway restart
openclaw health
```

Notes:

- If your Gateway runs as a service, `openclaw gateway restart` is preferred over killing PIDs.
- If you’re pinned to a specific version, see “Rollback / pinning” below.

## Update (`openclaw update`)

For **source installs** (git checkout), prefer:

```bash
openclaw update
```

It runs a safe-ish update flow:

- Requires a clean worktree.
- Switches to the selected channel (tag or branch).
- Fetches + rebases against the configured upstream (dev channel).
- Installs deps, builds, builds the Control UI, and runs `openclaw doctor`.
- Restarts the gateway by default (use `--no-restart` to skip).

If you installed via **npm/pnpm** (no git metadata), `openclaw update` will try to update via your package manager. If it can’t detect the install, use “Update (global install)” instead.

## Update (Control UI / RPC)

The Control UI has **Update & Restart** (RPC: `update.run`). It:

1. Runs the same source-update flow as `openclaw update` (git checkout only).
2. Writes a restart sentinel with a structured report (stdout/stderr tail).
3. Restarts the gateway and pings the last active session with the report.

If the rebase fails, the gateway aborts and restarts without applying the update.

## Update (from source)

From the repo checkout:

Preferred:

```bash
openclaw update
```

Manual (equivalent-ish):

```bash
git pull
pnpm install
pnpm build
pnpm ui:build # auto-installs UI deps on first run
openclaw doctor
openclaw health
```

Notes:

- `pnpm build` matters when you run the packaged `openclaw` binary ([`openclaw.mjs`](https://github.com/openclaw/openclaw/blob/main/openclaw.mjs)) or use Node to run `dist/`.
- If you run from a repo checkout without a global install, use `pnpm openclaw ...` for CLI commands.
- If you run directly from TypeScript (`pnpm openclaw ...`), a rebuild is usually unnecessary, but **config migrations still apply** → run doctor.
- Switching between global and git installs is easy: install the other flavor, then run `openclaw doctor` so the gateway service entrypoint is rewritten to the current install.

## Always Run: `openclaw doctor`

Doctor is the “safe update” command. It’s intentionally boring: repair + migrate + warn.

Note: if you’re on a **source install** (git checkout), `openclaw doctor` will offer to run `openclaw update` first.

Typical things it does:

- Migrate deprecated config keys / legacy config file locations.
- Audit DM policies and warn on risky “open” settings.
- Check Gateway health and can offer to restart.
- Detect and migrate older gateway services (launchd/systemd; legacy schtasks) to current OpenClaw services.
- On Linux, ensure systemd user lingering (so the Gateway survives logout).

Details: [Doctor](/gateway/doctor)

## Start / stop / restart the Gateway

CLI (works regardless of OS):

```bash
openclaw gateway status
openclaw gateway stop
openclaw gateway restart
openclaw gateway --port 18789
openclaw logs --follow
```

If you’re supervised:

- macOS launchd (app-bundled LaunchAgent): `launchctl kickstart -k gui/$UID/ai.openclaw.gateway` (use `ai.openclaw.<profile>`; legacy `com.openclaw.*` still works)
- Linux systemd user service: `systemctl --user restart openclaw-gateway[-<profile>].service`
- Windows (WSL2): `systemctl --user restart openclaw-gateway[-<profile>].service`
  - `launchctl`/`systemctl` only work if the service is installed; otherwise run `openclaw gateway install`.

Runbook + exact service labels: [Gateway runbook](/gateway)

## Rollback / pinning (when something breaks)

### Pin (global install)

Install a specific commit or tag from the NightClaw repo (replace `<tag>` with the last working tag, e.g. `v2026.3.3`):

```bash
npm install -g github:r1skarctic/nightclaw#<tag>
```

```bash
pnpm add -g github:r1skarctic/nightclaw#<tag>
```

Tip: find available tags at [github.com/r1skarctic/nightclaw/releases](https://github.com/r1skarctic/nightclaw/releases).

Then restart + re-run doctor:

```bash
openclaw doctor
openclaw gateway restart
```

### Pin (source) by date

Pick a commit from a date (example: “state of main as of 2026-01-01”):

```bash
git fetch origin
git checkout "$(git rev-list -n 1 --before=\"2026-01-01\" origin/main)"
```

Then reinstall deps + restart:

```bash
pnpm install
pnpm build
openclaw gateway restart
```

If you want to go back to latest later:

```bash
git checkout main
git pull
```

## If you’re stuck

- Run `openclaw doctor` again and read the output carefully (it often tells you the fix).
- Check: [Troubleshooting](/gateway/troubleshooting)
- Ask in Discord: [https://discord.gg/clawd](https://discord.gg/clawd)
