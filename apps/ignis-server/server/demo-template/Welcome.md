# Welcome to Ignis

This is a live demo of [Ignis](https://github.com/Nystik-gh/ignis), Obsidian running in a browser tab with vault files held on a server. Edit this note, poke around the sidebar, create new vaults; changes save automatically until your session ends.

## Demo limits

These limits come from server environment variables (`DEMO_TIMEOUT_MS`, `DEMO_VAULTS_PER_SESSION`, `DEMO_SESSION_QUOTA_BYTES`). See [[Environment variables]] for details.

- Vault data is wiped after about 30 minutes of inactivity.
- Each session can hold up to 3 vaults, capped at 700 KB total.
- Obsidian account login is disabled. (Do not put credentials into a server you do not control. Be mindful of your security.)

## What to read next

- [[What is Ignis]] for what this is and how it's put together.
- [[Getting Started]] for things specific to Ignis worth trying.
- [[What works]] for the compatibility picture and what Ignis adds on top.
- [[Session and auth]] for local auth, ACL, and the browser session API (DataviewJS).
- [[Environment variables]] for demo and self-hosted configuration.
