<script lang="ts">
  import { page } from '$app/stores';
  import { auth } from '../stores/auth.store.js';
  import { hapticLight } from '../native/haptics.js';
  import { Home, Ticket, Trophy, User } from 'lucide-svelte';

  const items = [
    { href: '/home', label: 'Home', icon: Home, requiresAuth: false },
    { href: '/raffles', label: 'Raffles', icon: Ticket, requiresAuth: false },
    { href: '/wins', label: 'Wins', icon: Trophy, requiresAuth: true },
    { href: '/profile', label: 'Profile', icon: User, requiresAuth: true },
  ];

  $: current = $page.url.pathname;

  // Tapping an account-specific tab while signed out goes straight to the
  // phone prompt (with a returnTo) instead of flashing the tab then bouncing.
  function hrefFor(item: (typeof items)[number]) {
    if (item.requiresAuth && !$auth.isAuthenticated) {
      return `/login?returnTo=${encodeURIComponent(item.href)}`;
    }
    return item.href;
  }
</script>

<nav
  class="safe-area-bottom bottom-nav fixed inset-x-4 bottom-4 z-10 grid h-[76px] grid-cols-4 items-center rounded-nav bg-card px-1 shadow-nav"
  aria-label="Primary navigation"
>
  {#each items as item (item.href)}
    {@const active = current.startsWith(item.href)}
    <a
      href={hrefFor(item)}
      aria-current={active ? 'page' : undefined}
      on:click={() => {
        if (!active) hapticLight();
      }}
      class="nav-link tappable flex h-full flex-col items-center justify-center text-inherit no-underline {active ? 'is-active' : ''}"
    >
      <span
        class="nav-icon flex h-12 w-12 items-center justify-center rounded-full {active ? 'bg-bg-start' : 'bg-transparent'}"
      >
        <span class="nav-glyph flex items-center justify-center">
          <svelte:component
            this={item.icon}
            size={18}
            strokeWidth={active ? 2.25 : 2}
            class="transition-[color,fill-opacity] duration-150 ease-[var(--ease-out)] {active
              ? 'fill-primary-dark/[0.16] text-primary-dark'
              : 'fill-none text-ink'}"
          />
        </span>
      </span>
      <span
        class="nav-label text-[10px] font-semibold leading-none transition-colors duration-150 ease-[var(--ease-out)] {active
          ? 'text-primary-dark'
          : 'text-ink'}"
      >
        {item.label}
      </span>
    </a>
  {/each}
</nav>

<style>
  .bottom-nav {
    isolation: isolate;
  }

  .nav-link {
    position: relative;
    gap: 0;
    -webkit-tap-highlight-color: transparent;
  }

  .nav-icon {
    transform: translate3d(0, 0, 0) scale(0.75);
    transform-origin: center;
    transition:
      transform 420ms cubic-bezier(0.34, 1.42, 0.64, 1),
      box-shadow 300ms cubic-bezier(0.16, 1, 0.3, 1),
      background-color 220ms cubic-bezier(0.16, 1, 0.3, 1);
    backface-visibility: hidden;
  }

  .nav-glyph {
    transform: scale(1.12);
    transition:
      transform 360ms cubic-bezier(0.34, 1.42, 0.64, 1),
      color 180ms cubic-bezier(0.16, 1, 0.3, 1),
      fill-opacity 180ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .nav-label {
    margin-top: -5px;
    transform: translate3d(0, 0, 0);
    opacity: 0.82;
    transition:
      transform 360ms cubic-bezier(0.34, 1.42, 0.64, 1),
      opacity 220ms cubic-bezier(0.16, 1, 0.3, 1),
      color 180ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .nav-link.is-active .nav-icon {
    transform: translate3d(0, -19px, 0) scale(1);
    box-shadow:
      0 0 0 6px var(--color-card),
      0 13px 25px -16px rgba(0, 181, 137, 0.48),
      inset 0 1px 0 rgba(255, 255, 255, 0.7);
  }

  .nav-link.is-active .nav-glyph {
    transform: scale(1.06);
  }

  .nav-link.is-active .nav-label {
    transform: translate3d(0, 5px, 0);
    opacity: 1;
  }

  .nav-link:active .nav-icon {
    transform: translate3d(0, 1px, 0) scale(0.7);
  }

  .nav-link.is-active:active .nav-icon {
    transform: translate3d(0, -17px, 0) scale(0.96);
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-icon,
    .nav-glyph,
    .nav-label {
      transition-duration: 1ms;
    }
  }
</style>
