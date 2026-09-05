<script lang="ts">
  export let variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass' = 'primary';
  export let size: 'md' | 'lg' = 'md';
  export let disabled = false;
  export let loading = false;
  export let type: 'button' | 'submit' = 'button';
  export let shine = false;

  const variantClasses = {
    primary:
      'bg-gradient-to-br from-coral-start to-coral-end text-white shadow-[0_6px_16px_rgba(255,107,107,0.35)]',
    secondary: 'bg-card text-ink shadow-card-light',
    ghost: 'bg-transparent text-primary-dark',
    // iOS convention — destructive actions (log out, delete, cancel) read
    // as plain red text, not a filled button, to stay visually secondary
    // to the screen's primary action while still signaling consequence.
    danger: 'bg-transparent text-coral-start',
    // Frosted-glass CTA — translucent coral tint + backdrop-blur with a
    // white top-edge highlight to catch light, like an iOS material button.
    glass:
      'relative overflow-hidden border border-white/50 bg-gradient-to-br from-[rgba(255,107,107,0.82)] to-[rgba(255,134,116,0.7)] text-white shadow-[0_10px_26px_rgba(255,107,107,0.32),inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-md',
  } as const;

  const sizeClasses = {
    md: 'h-11 text-[15px] px-5',
    lg: 'h-[52px] text-base px-6',
  } as const;
</script>

<button
  {type}
  class="pressable inline-flex w-full items-center justify-center gap-2 rounded-button font-sans font-semibold disabled:cursor-not-allowed disabled:opacity-50 {variantClasses[
    variant
  ]} {sizeClasses[size]}"
  disabled={disabled || loading}
  on:click
>
  {#if variant === 'glass'}
    <span
      class="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/45 via-white/10 to-transparent"
      aria-hidden="true"
    ></span>
    {#if shine && !loading && !disabled}
      <span class="glass-flash pointer-events-none absolute inset-y-0 left-0 w-[34%]" aria-hidden="true"></span>
    {/if}
  {/if}
  <span class="relative z-10 inline-flex items-center gap-2">
    {#if loading}
      <span
        class="h-4 w-4 animate-spin rounded-full border-2 {variant === 'primary' || variant === 'glass'
          ? 'border-white/40 border-t-white'
          : 'border-black/15 border-t-primary-dark'}"
        aria-hidden="true"
      ></span>
    {/if}
    <slot />
  </span>
</button>

<style>
  .glass-flash {
    transform: translate3d(-170%, 0, 0) skewX(-18deg);
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.18), transparent);
    filter: blur(0.5px);
    animation: button-glass-flash 3.6s cubic-bezier(0.16, 1, 0.3, 1) 1s infinite;
    will-change: transform;
  }

  @keyframes button-glass-flash {
    0%, 68% { transform: translate3d(-170%, 0, 0) skewX(-18deg); }
    88%, 100% { transform: translate3d(420%, 0, 0) skewX(-18deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .glass-flash { animation: none; }
  }
</style>
