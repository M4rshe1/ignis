<script>
  import { Shield, LogOut } from "lucide-svelte";
  import { createEventDispatcher } from "svelte";
  import { authService } from "@ignis/services";

  export let displayName = "";
  export let isSuperadmin = false;

  const dispatch = createEventDispatcher();

  let loggingOut = false;

  async function onLogout() {
    if (loggingOut) {
      return;
    }

    loggingOut = true;

    try {
      await authService.logout();
      window.location.reload();
    } catch {
      loggingOut = false;
    }
  }
</script>

<div class="session-bar">
  {#if displayName}
    <span class="session-user" title="Signed in">{displayName}</span>
  {/if}

  {#if isSuperadmin}
    <button class="session-btn accent" title="Access control" on:click={() => dispatch("open")}>
      <Shield size="1rem" />
      <span>Access</span>
    </button>
  {/if}

  <button
    class="session-btn"
    title="Sign out"
    disabled={loggingOut}
    on:click={onLogout}
  >
    <LogOut size="1rem" />
    <span>{loggingOut ? "Signing out..." : "Sign out"}</span>
  </button>
</div>

<style>
  .session-bar {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: 2147483646;
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem;
    border: 1px solid var(--background-modifier-border, #3a3a3a);
    border-radius: 999px;
    background: var(--background-secondary, #262626);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    font-family: var(--font-interface, system-ui, sans-serif);
  }

  .session-user {
    padding: 0 0.5rem 0 0.625rem;
    font-size: 0.8125rem;
    color: var(--text-muted, #999);
    max-width: 8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.4375rem 0.75rem;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--text-normal, #dcddde);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
  }

  .session-btn:hover:not(:disabled) {
    background: var(--background-modifier-hover, rgba(255, 255, 255, 0.06));
  }

  .session-btn:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .session-btn.accent:hover:not(:disabled) {
    background: var(--interactive-accent, #7c3aed);
    color: var(--text-on-accent, #fff);
  }
</style>
