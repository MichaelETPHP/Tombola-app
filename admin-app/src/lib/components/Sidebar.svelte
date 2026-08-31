<script lang="ts">
  import { page } from '$app/stores';
  import { auth, clearAuth } from '../stores/auth.store.js';
  import { goto } from '$app/navigation';
  import {
    ChartNoAxesCombined,
    ChevronRight,
    FileClock,
    LogOut,
    Menu,
    PackageCheck,
    Plug,
    Settings,
    ShieldCheck,
    Ticket,
    Users,
    X,
  } from 'lucide-svelte';

  $: links = [
    { href: '/', label: 'Control center', icon: ChartNoAxesCombined, exact: true },
    { href: '/raffles', label: 'Raffles', icon: Ticket },
    { href: '/users', label: 'Registered users', icon: Users },
    { href: '/payouts', label: 'Payouts', icon: PackageCheck },
    { href: '/audit-log', label: 'Audit trail', icon: FileClock },
    // Owner-only, same gate as the API route it reads from.
    ...($auth.admin?.role === 'owner' ? [{ href: '/integrations', label: 'Integrations', icon: Plug }] : []),
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  let menuOpen = false;
  $: current = $page.url.pathname;
  $: initials = ($auth.admin?.fullName ?? $auth.admin?.email ?? 'TA')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  $: roleLabel = $auth.admin?.role === 'owner' ? 'Super Admin' : 'Moderator';

  function isActive(href: string, exact?: boolean) {
    return exact ? current === href : current === href || current.startsWith(`${href}/`);
  }

  function logout() {
    clearAuth();
    goto('/login', { replaceState: true });
  }
</script>

<header class="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur-lg lg:hidden">
  <a href="/" class="flex items-center gap-2.5 no-underline" aria-label="Tombola admin home">
    <span class="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary text-white">
      <ShieldCheck size={18} strokeWidth={2} />
    </span>
    <div>
      <p class="text-sm font-extrabold leading-none text-ink">Tombola</p>
      <p class="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-primary-dark">Super Admin</p>
    </div>
  </a>
  <button
    type="button"
    class="admin-press flex h-10 w-10 items-center justify-center rounded-button border border-border bg-card text-ink"
    aria-label="Open navigation"
    aria-expanded={menuOpen}
    on:click={() => (menuOpen = true)}
  >
    <Menu size={19} />
  </button>
</header>

{#if menuOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-[#17201e]/40 backdrop-blur-sm lg:hidden"
    aria-label="Close navigation"
    on:click={() => (menuOpen = false)}
  ></button>

  <aside class="fixed inset-y-0 left-0 z-50 flex w-[288px] flex-col bg-sidebar p-4 text-sidebar-text shadow-2xl lg:hidden">
    <div class="mb-7 flex items-center justify-between px-1 pt-1">
      <div class="flex items-center gap-3">
        <span class="flex h-10 w-10 items-center justify-center rounded-[13px] bg-primary text-white">
          <ShieldCheck size={19} strokeWidth={2} />
        </span>
        <div>
          <p class="text-sm font-extrabold leading-none text-white">Tombola</p>
          <p class="mt-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-primary">Super Admin</p>
        </div>
      </div>
      <button type="button" class="flex h-9 w-9 items-center justify-center rounded-button bg-sidebar-active" on:click={() => (menuOpen = false)} aria-label="Close navigation">
        <X size={17} />
      </button>
    </div>

    <nav class="flex flex-col gap-1.5">
      {#each links as link (link.href)}
        <a
          href={link.href}
          on:click={() => (menuOpen = false)}
          class="admin-press flex min-h-11 items-center gap-3 rounded-button px-3.5 text-[13px] font-semibold no-underline {isActive(link.href, link.exact)
            ? 'bg-sidebar-active text-white shadow-[inset_3px_0_0_var(--color-primary)]'
            : 'text-sidebar-text hover:bg-sidebar-active/60 hover:text-white'}"
        >
          <svelte:component this={link.icon} size={17} strokeWidth={2} />
          <span>{link.label}</span>
          {#if isActive(link.href, link.exact)}<ChevronRight size={14} class="ml-auto text-primary" />{/if}
        </a>
      {/each}
    </nav>

    <div class="mt-auto border-t border-white/10 pt-4">
      <div class="mb-3 flex items-center gap-3 px-1">
        <span class="flex h-10 w-10 items-center justify-center rounded-[13px] bg-primary/15 text-xs font-extrabold text-primary">{initials}</span>
        <div class="min-w-0">
          <p class="truncate text-xs font-bold text-white">{$auth.admin?.fullName ?? $auth.admin?.email}</p>
          <p class="mt-0.5 text-[10px] text-sidebar-text">{roleLabel}</p>
        </div>
      </div>
      <button class="admin-press flex h-10 w-full items-center justify-center gap-2 rounded-button border border-white/10 bg-transparent text-xs font-semibold text-sidebar-text hover:bg-sidebar-active" on:click={logout}>
        <LogOut size={14} /> Log out
      </button>
    </div>
  </aside>
{/if}

<aside class="sticky top-0 hidden h-dvh w-[268px] shrink-0 flex-col bg-sidebar px-4 py-5 text-sidebar-text lg:flex">
  <a href="/" class="mb-8 flex items-center gap-3 px-2 no-underline" aria-label="Tombola admin home">
    <span class="flex h-11 w-11 items-center justify-center rounded-[14px] bg-primary text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
      <ShieldCheck size={20} strokeWidth={2} />
    </span>
    <div>
      <p class="text-[15px] font-extrabold leading-none tracking-[-0.02em] text-white">Tombola</p>
      <p class="mt-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-primary">Super Admin</p>
    </div>
  </a>

  <div class="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-faint">Workspace</div>
  <nav class="flex flex-col gap-1.5">
    {#each links as link (link.href)}
      <a
        href={link.href}
        class="admin-press flex min-h-11 items-center gap-3 rounded-button px-3.5 text-[13px] font-semibold no-underline {isActive(link.href, link.exact)
          ? 'bg-sidebar-active text-white shadow-[inset_3px_0_0_var(--color-primary)]'
          : 'text-sidebar-text hover:bg-sidebar-active/60 hover:text-white'}"
      >
        <svelte:component this={link.icon} size={17} strokeWidth={2} />
        <span>{link.label}</span>
        {#if isActive(link.href, link.exact)}<ChevronRight size={14} class="ml-auto text-primary" />{/if}
      </a>
    {/each}
  </nav>

  <div class="mt-auto">
    <div class="mb-4 flex items-center gap-2 rounded-button border border-white/10 bg-sidebar-active/50 px-3 py-2.5">
      <span class="relative flex h-2 w-2">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50"></span>
        <span class="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
      </span>
      <div>
        <p class="text-[10px] font-bold text-white">System online</p>
        <p class="text-[9px] text-sidebar-text">API services connected</p>
      </div>
    </div>

    <div class="border-t border-white/10 pt-4">
      <div class="mb-3 flex items-center gap-3 px-1">
        <span class="flex h-10 w-10 items-center justify-center rounded-[13px] bg-primary/15 text-xs font-extrabold text-primary">{initials}</span>
        <div class="min-w-0">
          <p class="truncate text-xs font-bold text-white">{$auth.admin?.fullName ?? $auth.admin?.email}</p>
          <p class="mt-0.5 text-[10px] text-sidebar-text">{roleLabel}</p>
        </div>
      </div>
      <button class="admin-press flex h-10 w-full items-center justify-center gap-2 rounded-button border border-white/10 bg-transparent text-xs font-semibold text-sidebar-text hover:bg-sidebar-active" on:click={logout}>
        <LogOut size={14} /> Log out
      </button>
    </div>
  </div>
</aside>
