<script>
  import { createEventDispatcher } from "svelte";
  import { authService } from "@ignis/services";
  import Button from "../components/input/Button.svelte";

  export let reloadOnSuccess = true;

  const dispatch = createEventDispatcher();

  let username = "";
  let password = "";
  let error = "";
  let submitting = false;

  async function onSubmit() {
    if (submitting) {
      return;
    }

    error = "";
    submitting = true;

    try {
      const result = await authService.login(username, password);
      dispatch("success", result);

      if (reloadOnSuccess) {
        window.location.reload();
      }
    } catch (e) {
      error =
        e && e.status === 401
          ? "Invalid username or password"
          : "Sign-in failed. Please try again.";
      password = "";
    } finally {
      submitting = false;
    }
  }
</script>

<form class="login-form" on:submit|preventDefault={onSubmit}>
  <h1 class="login-title">Sign in to Ignis</h1>

  <input
    class="login-input"
    type="text"
    placeholder="Username"
    autocomplete="username"
    bind:value={username}
  />

  <input
    class="login-input"
    type="password"
    placeholder="Password"
    autocomplete="current-password"
    bind:value={password}
  />

  <div class="login-error">{error}</div>

  <Button variant="primary" type="submit" disabled={submitting}>
    {submitting ? "Signing in..." : "Sign in"}
  </Button>
</form>

<style>
  .login-form {
    width: 320px;
    max-width: 90vw;
    padding: 2rem;
    background: var(--background-secondary, #262626);
    border-radius: 0.75rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }

  .login-title {
    margin: 0 0 0.375rem;
    font-size: 1.25rem;
    font-weight: 600;
    text-align: center;
    color: var(--text-normal, #dcddde);
  }

  .login-input {
    padding: 0.625rem 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid var(--background-modifier-border, #3a3a3a);
    background: var(--background-primary, #1e1e1e);
    color: var(--text-normal, #dcddde);
    font-size: 0.875rem;
    outline: none;
  }

  .login-error {
    color: var(--text-error, #ff6b6b);
    font-size: 0.8125rem;
    min-height: 1rem;
    text-align: center;
  }
</style>
