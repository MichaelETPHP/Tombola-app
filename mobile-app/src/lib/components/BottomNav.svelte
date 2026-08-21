<script lang="ts">
  import { page } from '$app/stores';

  const items = [
    { href: '/home', label: 'Home', icon: '🏠' },
    { href: '/raffles', label: 'Raffles', icon: '🎟️' },
    { href: '/wins', label: 'Wins', icon: '🏆' },
    { href: '/tickets', label: 'Tickets', icon: '📋' },
    { href: '/profile', label: 'Profile', icon: '👤' },
  ];

  $: current = $page.url.pathname;
</script>

<nav class="bottom-nav safe-area-bottom">
  {#each items as item (item.href)}
    {@const active = current.startsWith(item.href)}
    <a href={item.href} class="nav-item tappable" class:active>
      <span class="icon">{item.icon}</span>
      <span class="label">{item.label}</span>
    </a>
  {/each}
</nav>

<style>
  .bottom-nav {
    position: fixed;
    left: var(--space-16);
    right: var(--space-16);
    bottom: var(--space-16);
    display: flex;
    justify-content: space-around;
    background: var(--color-card-bg);
    border-radius: var(--radius-nav);
    box-shadow: var(--shadow-nav);
    padding: var(--space-8) var(--space-4);
    z-index: 10;
  }

  .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--space-8) var(--space-12);
    border-radius: var(--radius-nav);
    text-decoration: none;
    color: var(--color-nav-inactive);
    transition: background 0.15s ease, color 0.15s ease;
  }

  .nav-item.active {
    background: var(--color-primary);
    color: #ffffff;
  }

  .icon {
    font-size: 18px;
    line-height: 1;
  }

  .label {
    font-size: 10px;
    font-weight: 500;
  }
</style>
