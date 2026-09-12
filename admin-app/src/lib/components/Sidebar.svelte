<script lang="ts">
  import { page } from '$app/stores';
  import { auth } from '../stores/auth.store.js';
  import { logoutAdmin, ApiError } from '../api/client.js';
  import { toast } from '../stores/toast.store.js';
  import { afterNavigate, goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { Bug, ChartNoAxesCombined, ChevronDown, FileClock, LogOut, Menu, MessageSquareText, PackageCheck, Plug, Settings, ShieldCheck, Ticket, Users, X } from 'lucide-svelte';

  let drawer: HTMLDialogElement;
  let menuButton: HTMLButtonElement;
  let menuOpen = false;
  let rafflesExpanded = false;
  let loggingOut = false;
  let previousOverflow = '';
  $: current = $page.url.pathname;
  $: roleLabel = $auth.admin?.role === 'owner' ? 'Owner' : 'Moderator';
  $: initials = ($auth.admin?.fullName ?? $auth.admin?.phone ?? 'YA').split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
  $: links = [
    { href: '/users', label: 'Registered users', icon: Users },
    { href: '/payouts', label: 'Payouts', icon: PackageCheck },
    { href: '/audit-log', label: 'Audit trail', icon: FileClock },
    ...($auth.admin?.role === 'owner' ? [
      { href: '/integrations', label: 'Integrations', icon: Plug },
      { href: '/sms', label: 'SMS log', icon: MessageSquareText },
      { href: '/crashes', label: 'Crash reports', icon: Bug },
    ] : []),
    { href: '/settings', label: 'Settings', icon: Settings },
  ];
  $: raffleLinks = [
    { href: '/raffles', label: 'All raffles' },
    { href: '/raffles/new', label: 'Create raffle' },
    ...($auth.admin?.role === 'owner' ? [{ href: '/raffles/profit', label: 'Profit' }] : []),
  ];

  function isActive(href: string) {
    if (href === '/raffles') return current === href || (current.startsWith('/raffles/') && !['/raffles/new', '/raffles/profit'].includes(current));
    return current === href || current.startsWith(href + '/');
  }
  // Active gets its own signature — a primary-colored left bar plus a
  // tinted background — instead of just a darker/lighter version of the
  // hover color. Sharing one palette between "where you are" and "what
  // you're pointing at" made them read as the same state at a glance;
  // giving active a distinct accent color (not just opacity) fixes that
  // regardless of which nav section it's in.
  const navClass = (active: boolean) =>
    `admin-nav-item relative flex min-h-11 items-center gap-3 rounded-button pl-3.5 pr-3 text-sm font-medium no-underline ${
      active
        ? 'admin-nav-active bg-primary/15 text-white'
        : 'text-sidebar-text hover:bg-white/[0.06] hover:text-white'
    }`;

  function openMenu() {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawer.showModal();
    menuOpen = true;
  }
  function closeMenu() { if (drawer?.open) drawer.close(); }
  function didClose() {
    if (!menuOpen) return;
    document.body.style.overflow = previousOverflow;
    menuOpen = false;
    menuButton?.focus({ preventScroll: true });
  }
  afterNavigate(() => {
    closeMenu();
    if (current.startsWith('/raffles')) rafflesExpanded = true;
  });
  onMount(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const resized = () => { if (desktop.matches) closeMenu(); };
    desktop.addEventListener('change', resized);
    return () => {
      desktop.removeEventListener('change', resized);
      if (menuOpen) document.body.style.overflow = previousOverflow;
    };
  });
  async function logout() {
    if (loggingOut) return;
    loggingOut = true;
    try {
      await logoutAdmin();
      closeMenu();
      await goto('/login', { replaceState: true });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not sign out. Check your connection and retry.', 'Sign out failed');
    } finally { loggingOut = false; }
  }
</script>

{#snippet brand()}
  <a href="/" class="flex items-center gap-3 no-underline" aria-label="YeneEta admin home">
    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary text-white"><ShieldCheck size={20} /></span>
    <div><p class="text-base font-bold text-white">YeneEta</p><p class="mt-0.5 text-xs text-sidebar-text">Administration</p></div>
  </a>
{/snippet}

{#snippet navigation(id: string)}
  <nav aria-label="Admin navigation" class="space-y-1">
    <a href="/" aria-current={current === '/' ? 'page' : undefined} class={navClass(current === '/')}><ChartNoAxesCombined size={18} /> Control center</a>
    <div class="admin-nav-item relative flex items-center rounded-button {current.startsWith('/raffles') ? 'admin-nav-active bg-primary/15' : ''}">
      <a href="/raffles" class="flex min-h-11 flex-1 items-center gap-3 rounded-button pl-3.5 pr-3 text-sm font-medium no-underline {current.startsWith('/raffles') ? 'text-white' : 'text-sidebar-text hover:text-white'}"><Ticket size={18} /> Raffles</a>
      <button type="button" aria-label={rafflesExpanded ? 'Collapse raffle menu' : 'Expand raffle menu'} aria-expanded={rafflesExpanded} aria-controls={id} on:click={() => rafflesExpanded = !rafflesExpanded} class="flex h-11 w-11 items-center justify-center rounded-button text-sidebar-text transition-colors hover:text-white"><ChevronDown size={17} class="transition-transform duration-200 {rafflesExpanded ? 'rotate-180' : ''}" /></button>
    </div>
    <div {id} hidden={!rafflesExpanded} class="ml-5 border-l border-white/15 pl-3">
      {#each raffleLinks as link}
        <a href={link.href} aria-current={isActive(link.href) ? 'page' : undefined} class={navClass(isActive(link.href))}>{link.label}</a>
      {/each}
    </div>
    {#each links as link}
      <a href={link.href} aria-current={isActive(link.href) ? 'page' : undefined} class={navClass(isActive(link.href))}><svelte:component this={link.icon} size={18} />{link.label}</a>
    {/each}
  </nav>
{/snippet}

{#snippet account()}
  <div class="border-t border-white/10 pt-4">
    <div class="mb-4 flex items-center gap-3">
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-button bg-sidebar-active text-sm font-bold text-white">{initials}</span>
      <div class="min-w-0"><p class="truncate text-sm font-bold text-white">{$auth.admin?.fullName ?? $auth.admin?.phone ?? 'Administrator'}</p><p class="mt-0.5 text-xs text-sidebar-text">{roleLabel}</p></div>
    </div>
    <button type="button" disabled={loggingOut} on:click={logout} class="admin-press flex min-h-11 w-full items-center justify-center gap-2 rounded-button border border-white/20 text-sm text-sidebar-text hover:bg-sidebar-active disabled:opacity-60"><LogOut size={16} />{loggingOut ? 'Signing out…' : 'Log out'}</button>
  </div>
{/snippet}

<header class="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
  <a href="/" class="flex items-center gap-2 text-base font-bold text-ink no-underline"><ShieldCheck size={23} class="text-primary-dark" /> YeneEta <span class="font-normal text-muted">Admin</span></a>
  <button bind:this={menuButton} type="button" class="admin-press flex h-11 w-11 items-center justify-center rounded-button border border-border text-ink" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={menuOpen} on:click={openMenu}><Menu size={20} /></button>
</header>

<dialog bind:this={drawer} on:close={didClose} on:click={(event) => { if (event.target === drawer) closeMenu(); }} aria-label="Admin navigation"
  class="m-0 h-dvh max-h-none w-[min(320px,calc(100vw-24px))] max-w-none border-0 bg-sidebar p-0 text-sidebar-text">
  <div class="flex min-h-full flex-col gap-6 p-4">
    <div class="flex items-center justify-between gap-2">{@render brand()}<button type="button" on:click={closeMenu} class="flex h-11 w-11 items-center justify-center rounded-button text-sidebar-text hover:bg-sidebar-active" aria-label="Close navigation"><X size={20} /></button></div>
    {@render navigation('mobile-raffles-menu')}
    <div class="mt-auto">{@render account()}</div>
  </div>
</dialog>

<aside class="sticky top-0 hidden h-dvh w-[252px] shrink-0 flex-col gap-7 overflow-y-auto bg-sidebar px-4 py-6 lg:flex">
  {@render brand()}
  {@render navigation('desktop-raffles-menu')}
  <div class="mt-auto pt-5">{@render account()}</div>
</aside>

<style>
  dialog::backdrop { background: rgb(15 30 24 / 52%); }
</style>
