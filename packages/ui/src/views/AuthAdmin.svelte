<script>
  import { onMount, createEventDispatcher } from "svelte";
  import {
    Shield,
    Users,
    UsersRound,
    KeyRound,
    Plus,
    Trash2,
    Pencil,
  } from "lucide-svelte";
  import Modal from "../components/layout/Modal.svelte";
  import Button from "../components/input/Button.svelte";
  import ConfirmDialog from "../components/layout/ConfirmDialog.svelte";
  import MessageDialog from "../components/layout/MessageDialog.svelte";
  import { authService } from "@ignis/services";

  const TABS = [
    { id: "users", label: "Users", icon: Users },
    { id: "groups", label: "Groups", icon: UsersRound },
    { id: "grants", label: "Permissions", icon: KeyRound },
  ];

  const dispatch = createEventDispatcher();

  let tab = "users";
  let modalRef;
  let loading = true;
  let error = "";

  let users = [];
  let groups = [];
  let grants = [];
  let vaults = [];

  let showUserForm = false;
  let editingUser = null;
  let userForm = emptyUserForm();

  let showGroupForm = false;
  let editingGroup = null;
  let groupForm = { name: "", displayName: "", description: "" };

  let showGrantForm = false;
  let editingGrant = null;
  let grantForm = emptyGrantForm();

  let confirmDialog = null;
  let messageDialog = null;

  function emptyUserForm() {
    return {
      username: "",
      password: "",
      displayName: "",
      globalRole: "user",
      groups: [],
      disabled: false,
    };
  }

  function grantActionsFromForm(form) {
    const actions = [];

    if (form.actionList) {
      actions.push("list");
    }

    if (form.actionRead) {
      actions.push("read");
    }

    if (form.actionWrite) {
      actions.push("write");
    }

    if (form.actionDelete) {
      actions.push("delete");
    }

    if (form.actionAdmin) {
      actions.push("admin");
    }

    return actions;
  }

  function grantFormFromActions(actions) {
    const set = new Set(actions || []);

    return {
      actionList: set.has("list"),
      actionRead: set.has("read"),
      actionWrite: set.has("write"),
      actionDelete: set.has("delete"),
      actionAdmin: set.has("admin"),
    };
  }

  function emptyGrantForm() {
    return {
      subjectType: "group",
      subjectId: "",
      vault: "",
      path: "",
      ...grantFormFromActions(["list", "read"]),
      effect: "allow",
    };
  }

  async function loadAll() {
    loading = true;
    error = "";

    try {
      [users, groups, grants] = await Promise.all([
        authService.listUsers(),
        authService.listGroups(),
        authService.listGrants(),
      ]);

      const vaultRes = await fetch("/api/vault/list");
      vaults = vaultRes.ok ? await vaultRes.json() : [];
    } catch (e) {
      error = e.message || "Failed to load admin data";
    } finally {
      loading = false;
    }
  }

  function openCreateUser() {
    editingUser = null;
    userForm = emptyUserForm();
    showUserForm = true;
  }

  function openEditUser(user) {
    editingUser = user;
    userForm = {
      username: user.username,
      password: "",
      displayName: user.displayName || user.username,
      globalRole: user.globalRole || "user",
      groups: [...(user.groups || [])],
      disabled: !!user.disabled,
    };
    showUserForm = true;
  }

  async function saveUser() {
    try {
      if (editingUser) {
        const patch = {
          displayName: userForm.displayName,
          globalRole: userForm.globalRole,
          groups: userForm.groups,
          disabled: userForm.disabled,
        };

        if (userForm.password) {
          patch.password = userForm.password;
        }

        await authService.updateUser(editingUser.username, patch);
      } else {
        if (!userForm.username.trim() || !userForm.password) {
          error = "Username and password are required";
          return;
        }

        await authService.createUser({
          username: userForm.username.trim(),
          password: userForm.password,
          displayName: userForm.displayName || userForm.username.trim(),
          globalRole: userForm.globalRole,
          groups: userForm.groups,
        });
      }

      showUserForm = false;
      await loadAll();
    } catch (e) {
      error = e.message;
    }
  }

  async function deleteUser(user) {
    confirmDialog = {
      title: "Delete user",
      message: `Delete user "${user.username}"?`,
      description: "This cannot be undone.",
      confirmText: "Delete",
      onConfirm: async () => {
        confirmDialog = null;

        try {
          await authService.deleteUser(user.username);
          await loadAll();
        } catch (e) {
          error = e.message;
        }
      },
    };
  }

  async function saveGroup() {
    try {
      if (editingGroup) {
        await authService.updateGroup(editingGroup.name, {
          displayName: groupForm.displayName,
          description: groupForm.description,
        });
      } else {
        if (!groupForm.name.trim()) {
          error = "Group name is required";
          return;
        }

        await authService.createGroup({
          name: groupForm.name.trim(),
          displayName: groupForm.displayName || groupForm.name.trim(),
          description: groupForm.description,
        });
      }

      closeGroupForm();
      await loadAll();
    } catch (e) {
      error = e.message;
    }
  }

  function openCreateGroup() {
    editingGroup = null;
    groupForm = { name: "", displayName: "", description: "" };
    showGroupForm = true;
    error = "";
  }

  function openEditGroup(group) {
    editingGroup = group;
    groupForm = {
      name: group.name,
      displayName: group.displayName || group.name,
      description: group.description || "",
    };
    showGroupForm = true;
    error = "";
  }

  function closeGroupForm() {
    showGroupForm = false;
    editingGroup = null;
    groupForm = { name: "", displayName: "", description: "" };
  }

  async function deleteGroup(group) {
    confirmDialog = {
      title: "Delete group",
      message: `Delete group "${group.name}"?`,
      description: "Remove all grants referencing this group first.",
      confirmText: "Delete",
      onConfirm: async () => {
        confirmDialog = null;

        try {
          await authService.deleteGroup(group.name);
          await loadAll();
        } catch (e) {
          error = e.message;
        }
      },
    };
  }

  function parseSubject(subject) {
    if (subject.startsWith("group:")) {
      return { subjectType: "group", subjectId: subject.slice(6) };
    }

    if (subject.startsWith("user:")) {
      return { subjectType: "user", subjectId: subject.slice(5) };
    }

    return { subjectType: "group", subjectId: "" };
  }

  function openCreateGrant() {
    editingGrant = null;
    grantForm = emptyGrantForm();
    showGrantForm = true;
    error = "";
  }

  function openEditGrant(grant) {
    editingGrant = grant;
    const { subjectType, subjectId } = parseSubject(grant.subject);

    grantForm = {
      subjectType,
      subjectId,
      vault: grant.vault,
      path: grant.path,
      ...grantFormFromActions(grant.actions),
      effect: grant.effect || "allow",
    };
    showGrantForm = true;
    error = "";
  }

  function closeGrantForm() {
    showGrantForm = false;
    editingGrant = null;
    grantForm = emptyGrantForm();
  }

  function buildSubject() {
    if (grantForm.subjectType === "group") {
      return "group:" + grantForm.subjectId;
    }

    return "user:" + grantForm.subjectId;
  }

  async function saveGrant() {
    try {
      if (!grantForm.subjectId || !grantForm.vault || !grantForm.path.trim()) {
        error = "Subject, vault, and path are required";
        return;
      }

      const actions = grantActionsFromForm(grantForm);

      if (actions.length === 0) {
        error = "Select at least one action";
        return;
      }

      const body = {
        subject: buildSubject(),
        vault: grantForm.vault,
        path: grantForm.path.trim(),
        actions,
        effect: grantForm.effect,
      };

      if (editingGrant) {
        await authService.updateGrant(editingGrant.id, body);
      } else {
        await authService.createGrant(body);
      }

      closeGrantForm();
      await loadAll();
    } catch (e) {
      error = e.message;
    }
  }

  async function deleteGrant(grant) {
    confirmDialog = {
      title: "Remove permission",
      message: `Remove grant for ${grant.subject}?`,
      description: `${grant.vault}: ${grant.path}`,
      confirmText: "Remove",
      onConfirm: async () => {
        confirmDialog = null;

        try {
          await authService.deleteGrant(grant.id);
          await loadAll();
        } catch (e) {
          error = e.message;
        }
      },
    };
  }

  function subjectLabel(subject) {
    if (subject.startsWith("group:")) {
      return subject.slice(6);
    }

    if (subject.startsWith("user:")) {
      const id = subject.slice(5);
      const user = users.find((u) => u.id === id);
      return user ? user.username : id;
    }

    return subject;
  }

  function onEscape() {
    if (confirmDialog || messageDialog) {
      return;
    }

    if (showUserForm || showGroupForm || showGrantForm) {
      showUserForm = false;
      closeGroupForm();
      closeGrantForm();
      return;
    }

    modalRef.dismiss();
  }

  onMount(loadAll);

  function onModalClose() {
    dispatch("close");
  }
</script>

<Modal
  title="Access control"
  width="720px"
  bind:this={modalRef}
  on:escape={onEscape}
  on:close={onModalClose}
  closeOnOverlayClick={false}
>
  <svelte:fragment slot="icon">
    <Shield size="1.25rem" />
  </svelte:fragment>

  <div class="tabs">
    {#each TABS as t (t.id)}
      <button
        class="tab"
        class:active={tab === t.id}
        on:click={() => {
          tab = t.id;
          error = "";
        }}
      >
        <svelte:component this={t.icon} size="1rem" />
        {t.label}
      </button>
    {/each}
  </div>

  {#if error}
    <div class="banner error">{error}</div>
  {/if}

  <div class="panel">
    {#if loading}
      <div class="empty">Loading...</div>
    {:else if tab === "users"}
      {#if showUserForm}
        <div class="form">
          <h3>{editingUser ? "Edit user" : "New user"}</h3>

          {#if !editingUser}
            <label class="field">
              <span>Username</span>
              <input type="text" bind:value={userForm.username} />
            </label>
          {/if}

          <label class="field">
            <span>{editingUser ? "New password (optional)" : "Password"}</span>
            <input type="password" bind:value={userForm.password} />
          </label>

          <label class="field">
            <span>Display name</span>
            <input type="text" bind:value={userForm.displayName} />
          </label>

          <label class="field">
            <span>Role</span>
            <select bind:value={userForm.globalRole}>
              <option value="user">User</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </label>

          {#if editingUser}
            <label class="checkbox-row">
              <input type="checkbox" bind:checked={userForm.disabled} />
              Disabled
            </label>
          {/if}

          {#if groups.length > 0}
            <div class="field">
              <span>Groups</span>
              <div class="checkbox-grid">
                {#each groups as g (g.name)}
                  <label class="checkbox-row">
                    <input type="checkbox" bind:group={userForm.groups} value={g.name} />
                    {g.displayName || g.name}
                  </label>
                {/each}
              </div>
            </div>
          {/if}

          <div class="form-actions">
            <Button variant="secondary" on:click={() => (showUserForm = false)}>
              Cancel
            </Button>
            <Button variant="primary" on:click={saveUser}>Save</Button>
          </div>
        </div>
      {:else}
        <div class="list">
          {#if users.length === 0}
            <div class="empty">No users yet.</div>
          {:else}
            {#each users as user (user.id)}
              <div class="row">
                <div class="row-main">
                  <div class="row-title">
                    {user.displayName || user.username}
                    {#if user.globalRole === "superadmin"}
                      <span class="badge">superadmin</span>
                    {/if}
                    {#if user.disabled}
                      <span class="badge muted">disabled</span>
                    {/if}
                  </div>
                  <div class="row-sub">
                    @{user.username}
                    {#if user.groups?.length}
                      · {user.groups.join(", ")}
                    {/if}
                  </div>
                </div>
                <div class="row-actions">
                  <button class="icon-btn" title="Edit" on:click={() => openEditUser(user)}>
                    <Pencil size="1rem" />
                  </button>
                  <button class="icon-btn danger" title="Delete" on:click={() => deleteUser(user)}>
                    <Trash2 size="1rem" />
                  </button>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    {:else if tab === "groups"}
      {#if showGroupForm}
        <div class="form">
          <h3>{editingGroup ? "Edit group" : "New group"}</h3>
          <label class="field">
            <span>Name (slug)</span>
            {#if editingGroup}
              <input type="text" value={groupForm.name} disabled />
            {:else}
              <input type="text" bind:value={groupForm.name} placeholder="contractors" />
            {/if}
          </label>
          <label class="field">
            <span>Display name</span>
            <input type="text" bind:value={groupForm.displayName} />
          </label>
          <label class="field">
            <span>Description</span>
            <input type="text" bind:value={groupForm.description} />
          </label>
          <div class="form-actions">
            <Button variant="secondary" on:click={closeGroupForm}>Cancel</Button>
            <Button variant="primary" on:click={saveGroup}>
              {editingGroup ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      {:else}
        <div class="list">
          {#if groups.length === 0}
            <div class="empty">No groups yet.</div>
          {:else}
            {#each groups as group (group.name)}
              <div class="row">
                <div class="row-main">
                  <div class="row-title">{group.displayName || group.name}</div>
                  <div class="row-sub">
                    {group.name}
                    {#if group.description}
                      · {group.description}
                    {/if}
                  </div>
                </div>
                <div class="row-actions">
                  <button class="icon-btn" title="Edit" on:click={() => openEditGroup(group)}>
                    <Pencil size="1rem" />
                  </button>
                  <button class="icon-btn danger" title="Delete" on:click={() => deleteGroup(group)}>
                    <Trash2 size="1rem" />
                  </button>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    {:else if tab === "grants"}
      {#if showGrantForm}
        <div class="form">
          <h3>{editingGrant ? "Edit permission" : "New permission"}</h3>

          <label class="field">
            <span>Apply to</span>
            <select
              bind:value={grantForm.subjectType}
              on:change={() => (grantForm.subjectId = "")}
            >
              <option value="group">Group</option>
              <option value="user">User</option>
            </select>
          </label>

          <label class="field">
            <span>{grantForm.subjectType === "group" ? "Group" : "User"}</span>
            <select bind:value={grantForm.subjectId}>
              <option value="">Select...</option>
              {#if grantForm.subjectType === "group"}
                {#each groups as g (g.name)}
                  <option value={g.name}>{g.displayName || g.name}</option>
                {/each}
              {:else}
                {#each users as u (u.id)}
                  <option value={u.id}>{u.username}</option>
                {/each}
              {/if}
            </select>
          </label>

          <label class="field">
            <span>Vault</span>
            <select bind:value={grantForm.vault}>
              <option value="">Select...</option>
              {#each vaults as v (v.id)}
                <option value={v.id}>{v.name}</option>
              {/each}
            </select>
          </label>

          <label class="field">
            <span>Path pattern</span>
            <input
              type="text"
              bind:value={grantForm.path}
              placeholder="Projects/ClientA/**"
            />
          </label>

          <div class="field">
            <span>Actions</span>
            <div class="checkbox-grid">
              <label class="checkbox-row">
                <input type="checkbox" bind:checked={grantForm.actionList} />
                list
              </label>
              <label class="checkbox-row">
                <input type="checkbox" bind:checked={grantForm.actionRead} />
                read
              </label>
              <label class="checkbox-row">
                <input type="checkbox" bind:checked={grantForm.actionWrite} />
                write
              </label>
              <label class="checkbox-row">
                <input type="checkbox" bind:checked={grantForm.actionDelete} />
                delete
              </label>
              <label class="checkbox-row">
                <input type="checkbox" bind:checked={grantForm.actionAdmin} />
                admin
              </label>
            </div>
          </div>

          <label class="field">
            <span>Effect</span>
            <select bind:value={grantForm.effect}>
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
            </select>
          </label>

          <div class="form-actions">
            <Button variant="secondary" on:click={closeGrantForm}>Cancel</Button>
            <Button variant="primary" on:click={saveGrant}>
              {editingGrant ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      {:else}
        <div class="list">
          {#if grants.length === 0}
            <div class="empty">No permissions yet. Users see nothing until granted.</div>
          {:else}
            {#each grants as grant (grant.id)}
              <div class="row">
                <div class="row-main">
                  <div class="row-title">
                    {subjectLabel(grant.subject)}
                    {#if grant.effect === "deny"}
                      <span class="badge danger">deny</span>
                    {/if}
                  </div>
                  <div class="row-sub">
                    {grant.vault} · {grant.path} · {grant.actions.join(", ")}
                  </div>
                </div>
                <div class="row-actions">
                  <button class="icon-btn" title="Edit" on:click={() => openEditGrant(grant)}>
                    <Pencil size="1rem" />
                  </button>
                  <button class="icon-btn danger" title="Remove" on:click={() => deleteGrant(grant)}>
                    <Trash2 size="1rem" />
                  </button>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    {/if}
  </div>

  <svelte:fragment slot="footer">
    <div class="footer-right">
      {#if tab === "users" && !showUserForm}
        <Button variant="ghost" on:click={openCreateUser}>
          <svelte:fragment slot="icon"><Plus size="1rem" /></svelte:fragment>
          Add user
        </Button>
      {:else if tab === "groups" && !showGroupForm}
        <Button variant="ghost" on:click={openCreateGroup}>
          <svelte:fragment slot="icon"><Plus size="1rem" /></svelte:fragment>
          Add group
        </Button>
      {:else if tab === "grants" && !showGrantForm}
        <Button variant="ghost" on:click={openCreateGrant}>
          <svelte:fragment slot="icon"><Plus size="1rem" /></svelte:fragment>
          Add permission
        </Button>
      {/if}
    </div>
  </svelte:fragment>
</Modal>

{#if confirmDialog}
  <ConfirmDialog
    title={confirmDialog.title}
    message={confirmDialog.message}
    description={confirmDialog.description}
    confirmText={confirmDialog.confirmText}
    on:confirm={confirmDialog.onConfirm}
    on:cancel={() => (confirmDialog = null)}
  />
{/if}

{#if messageDialog}
  <MessageDialog
    title={messageDialog.title}
    message={messageDialog.message}
    on:confirm={() => (messageDialog = null)}
  />
{/if}

<style>
  .tabs {
    display: flex;
    gap: 0.25rem;
    padding: 0.75rem 1rem 0;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 0.375rem 0.375rem 0 0;
    font-size: 0.875rem;
  }

  .tab.active {
    color: var(--text-normal);
    background: var(--background-primary);
  }

  .banner {
    margin: 0.75rem 1rem 0;
    padding: 0.625rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  .banner.error {
    background: rgba(233, 49, 71, 0.15);
    color: var(--text-error, #e93147);
  }

  .panel {
    padding: 0.75rem 1rem 1rem;
    overflow: auto;
    max-height: 55vh;
  }

  .empty {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 0.75rem;
    background: var(--background-primary);
    border-radius: 0.5rem;
    border: 1px solid var(--background-modifier-border);
  }

  .row-main {
    flex: 1;
    min-width: 0;
  }

  .row-title {
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-wrap: wrap;
  }

  .row-sub {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-top: 0.125rem;
  }

  .row-actions {
    display: flex;
    gap: 0.25rem;
  }

  .badge {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    background: var(--interactive-accent);
    color: var(--text-on-accent, #fff);
  }

  .badge.muted {
    background: var(--background-modifier-border);
    color: var(--text-muted);
  }

  .badge.danger {
    background: var(--text-error, #e93147);
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.375rem;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 0.25rem;
  }

  .icon-btn:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .icon-btn.danger:hover {
    color: var(--text-error, #e93147);
  }

  .form h3 {
    margin: 0 0 1rem;
    font-size: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 0.875rem;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .field input,
  .field select {
    padding: 0.5rem 0.625rem;
    border-radius: 0.375rem;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.875rem;
  }

  .checkbox-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--text-normal);
    font-size: 0.875rem;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .footer-right {
    display: flex;
    justify-content: flex-end;
    width: 100%;
  }
</style>
