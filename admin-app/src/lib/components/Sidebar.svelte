<script lang="ts">
  import { page } from '$app/stores';
  import { auth, clearAuth } from '../stores/auth.store.js';
  import { goto } from '$app/navigation';

  const links = [
    { href: '/', label: 'Overview', icon: '📊', exact: true },
    { href: '/raffles', label: 'Raffles', icon: '🎟️' },
    { href: '/payouts', label: 'Payouts', icon: '📦' },
    { href: '/users', label: 'Users', icon: '👥' },
    { href: '/audit-log', label: 'Audit log', icon: '🧾' },
  ];

  $: current = $page.url.pathname;

  function isActive(href: string, exact?: boolean) {
    return exact ? current === href : current === href || current.startsWith(`${href}/`);
  }

  function logout() {
    clearAuth();
    goto('/login', { replaceState: true });
  }
</script>

<aside class="sidebar">
  <div class="brand">
    <span class="logo">🎰</span>
    <span>Tombola Admin</span>
  </div>

  <nav>
    {#each links as link (link.href)}
      <a href={link.href} class="link" class:active={isActive(link.href, link.exact)}>
        <span class="icon">{link.icon}</span>
        {link.label}
      </a>
    {/each}
  </nav>

  <div class="footer">
    <div class="who">
      <span class="name">{$auth.admin?.fullName ?? $auth.admin?.email}</span>
      <span class="role">{$auth.admin?.role}</span>
    </div>
    <button class="logout" on:click={logout}>Log out</button>
  </div>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    width: 240px;
    min-height: 100vh;
    background: var(--color-sidebar-bg);
    color: var(--color-sidebar-text);
    padding: var(--space-20) var(--space-16);
    gap: var(--space-24);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    font-weight: 700;
    color: #ffffff;
    font-size: 15px;
  }

  .logo {
    font-size: 20px;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .link {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    padding: var(--space-8) var(--space-12);
    border-radius: var(--radius-button);
    text-decoration: none;
    color: var(--color-sidebar-text);
    font-size: 14px;
    font-weight: 500;
  }

  .link.active {
    background: var(--color-sidebar-active-bg);
    color: var(--color-sidebar-active-text);
  }

  .icon {
    font-size: 15px;
  }

  .footer {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    border-top: 1px solid var(--color-sidebar-active-bg);
    padding-top: var(--space-16);
  }

  .who {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 13px;
  }

  .name {
    color: #ffffff;
    font-weight: 600;
  }

  .role {
    color: var(--color-text-muted);
    text-transform: capitalize;
  }

  .logout {
    background: transparent;
    border: 1px solid var(--color-sidebar-active-bg);
    color: var(--color-sidebar-text);
    border-radius: var(--radius-button);
    padding: var(--space-8);
    font-size: 13px;
    cursor: pointer;
  }

  .logout:hover {
    background: var(--color-sidebar-active-bg);
  }
</style>
