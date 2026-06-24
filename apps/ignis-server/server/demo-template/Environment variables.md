# Environment variables

Ignis is configured through environment variables (or a repo-root `.env` file when running from source). This page covers the variables that matter for **this demo** and the ones you set when **self-hosting**.

For the full server reference, see the [Ignis Server README](https://github.com/Nystik-gh/ignis/tree/main/apps/ignis-server#environment-variables).

## This demo

This instance runs with `DEMO_MODE=true`. Demo mode gives each visitor an isolated session with transient vaults, automatic cleanup, and stricter network limits. The limits you see in [[Welcome]] come from these settings:

| Variable | What it controls here | Typical value |
| -------- | --------------------- | ------------- |
| `DEMO_MODE` | Enables demo mode (per-session vaults, cleanup, proxy allowlist, login blocking). | `true` |
| `DEMO_MAX_SESSIONS` | Max concurrent visitors. New sessions get a capacity page when full. | `20` |
| `DEMO_VAULTS_PER_SESSION` | Max vaults you can create in one session. | `3` |
| `DEMO_SESSION_QUOTA_BYTES` | Total storage budget per session across all vaults. | `716800` (700 KB) |
| `DEMO_TIMEOUT_MS` | Inactivity timeout before your vaults are wiped. | `1800000` (30 min) |
| `DEMO_TEMPLATE_DIR` | Starter notes copied into each new demo vault (this folder). | `server/demo-template/` |

Demo mode and local auth are mutually exclusive — this deployment does not set `AUTH_MODE=local`. See [[Session and auth]].

Other demo behaviour (not env vars, but worth knowing):

- Vault data is often on **tmpfs** in the reference deployment, so a container restart wipes everything.
- Obsidian account login is blocked at the proxy and in the UI.
- The cross-origin proxy is restricted to a safe allowlist.

Example demo compose: [`examples/demo/`](https://github.com/Nystik-gh/ignis/tree/main/apps/ignis-server/examples/demo) on GitHub.

## Self-hosted server

Common variables when running your own instance (Docker or from source):

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `PORT` | HTTP listen port | `8080` |
| `VAULT_ROOT` | Directory containing vault folders | `/vaults` (Docker) |
| `DATA_ROOT` | Persistent Ignis state (plugins, sync, auth files) | `/app/data` (Docker) |
| `OBSIDIAN_VERSION` | Obsidian version to download on first start | pinned per release |
| `OBSIDIAN_ASSETS_PATH` | Path to extracted Obsidian app files | set by entrypoint |
| `OBSIDIAN_PACKAGE` | Local `.deb` / `.asar` to unpack instead of downloading | unset |
| `AUTO_CREATE_DEFAULT` | Create "My Vault" when no vaults exist (`true` / `false`) | `false` |
| `PUID` / `PGID` | File ownership inside the container | `1000` |
| `WRITE_COALESCE_MS` | Debounce rapid writes (ms); useful on NFS, rclone, SMB | `0` |
| `WS_ORIGINS` | Comma-separated WebSocket `Origin` allowlist | any origin |
| `PROXY_ALLOW_PRIVATE_HOSTS` | IPs/CIDRs the proxy may reach on private networks | unset |

Runtime settings such as cache sizes and proxy mode can also be changed from **Settings → Ignis** in the Obsidian UI without restarting the server.

## Authentication (`AUTH_MODE=local`)

Only for self-hosted deployments — not used in this demo.

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `AUTH_MODE` | `none` (off) or `local` (built-in users + ACL) | `none` |
| `AUTH_BOOTSTRAP_USER` | First superadmin username when no users exist | unset |
| `AUTH_BOOTSTRAP_PASSWORD` | Password for bootstrap superadmin | unset |
| `AUTH_SESSION_TTL_MS` | Session lifetime in milliseconds | `604800000` (7 days) |
| `AUTH_COOKIE_SECURE` | Set session cookie `Secure` flag (`true` / `false`) | `false` |
| `PER_USER_OBSIDIAN_FILES` | Comma-separated globs for per-user `.obsidian` files (requires `AUTH_MODE=local`) | unset |

When `AUTH_MODE=local`, user, group, ACL, and session data are stored under `{DATA_ROOT}/auth/`. Per-user Obsidian config lives in each vault at `.obsidian/users/<userId>/`.

Details: [[Session and auth]].
