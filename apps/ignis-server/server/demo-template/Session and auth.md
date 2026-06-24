# Session and auth

Ignis can require sign-in and enforce per-vault, per-path access control when you self-host with `AUTH_MODE=local`. This page describes how that works and what session data is visible inside Obsidian (including from DataviewJS).

> **Demo note:** This live demo does not run local auth. `window.__ignis.session` will report `enabled: false`. Auth and ACL apply on self-hosted instances where you set `AUTH_MODE=local`.

## Local auth

When `AUTH_MODE=local` is set on the server:

- Users sign in with username and password. Sessions are stored in an HttpOnly cookie (`ignis-session`).
- **Superadmins** manage users, groups, and ACL grants from the **Access control** UI (ribbon shield icon) or via `/api/auth/admin/*`.
- **ACL grants** control who can `list`, `read`, `write`, `delete`, or `admin` paths in each vault. Grants use glob patterns (`Projects/**`, `Notes/Private/*`). Deny wins when two grants tie on specificity.
- Anyone with vault access gets implicit read/list on `.obsidian/**` so Obsidian can load its config.
- Vault creation requires superadmin. Rename and delete require the `admin` action on that vault.

When `AUTH_MODE` is unset or `none` (the default), none of the above runs. The server behaves as if the auth features would not exist.

`AUTH_MODE=local` cannot be combined with `DEMO_MODE=true`.

### Per-user `.obsidian` config

When auth is enabled, the server can store selected `.obsidian` files separately for each user. Configure `perUserObsidianFiles` in server settings or via `PER_USER_OBSIDIAN_FILES` (comma-separated globs). Files are stored at `.obsidian/users/<userId>/…` on disk; Obsidian uses the normal logical paths.

Example paths: `.obsidian/workspace.json`, `.obsidian/workspace.*.json`, `.obsidian/appearance.json`.

## Browser session API

During boot, Ignis fetches `/api/auth/status` and `/api/auth/me`, then exposes a read-only snapshot on `window.__ignis`:

| Property | Description |
|----------|-------------|
| `window.__ignis.session` | Auth snapshot: `enabled`, `mode`, `authenticated`, `user` |
| `window.__ignis.vault` | Current vault `{ id, path }` |
| `window.__ignis.refreshSession()` | Re-fetch status and `/me` (async) |

When authenticated, `session.user` contains:

```json
{
  "username": "alice",
  "id": "user_…",
  "displayName": "Alice",
  "globalRole": "user",
  "groups": ["editors"],
  "vaults": ["my-vault"]
}
```

`vaults` is the list of vault IDs the current user may access (filtered by ACL).

### What the browser cannot see

- The session cookie value (HttpOnly; not in `document.cookie`)
- Server-side session metadata (session ID, expiry, last activity)
- ACL grant definitions (superadmin admin API only)
- Password hashes or other internal user fields

## Inspect session data with DataviewJS

Paste this into a DataviewJS code block to dump everything the browser can read:

```js
await window.__ignis?.refreshSession?.();

const session = window.__ignis?.session ?? null;
const vault = window.__ignis?.vault ?? null;

const ignisMeta = {
  version: window.__ignis?.version ?? null,
  build: window.__ignis?.build ?? null,
  currentVaultId: window.__currentVaultId ?? null,
  vaultConfig: window.__vaultConfig ?? null,
};

dv.paragraph("```json\n" + JSON.stringify({ session, vault, ignisMeta }, null, 2) + "\n```");
```

On a self-hosted instance with auth enabled and a signed-in user, expect `session.authenticated: true` and a populated `session.user`. In this demo, expect `enabled: false` and `user: null`.

Call `await window.__ignis.refreshSession()` after login or logout if you need a fresh snapshot without reloading the page.

## Self-hosting

See [[Environment variables]] for `AUTH_MODE`, bootstrap credentials, and other server configuration. The [Ignis Server README](https://github.com/Nystik-gh/ignis/tree/main/apps/ignis-server) has Docker setup and the full reference.
