<script lang="ts">
  export let variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass' = 'primary';
  export let size: 'md' | 'lg' = 'md';
  export let disabled = false;
  export let loading = false;
  export let type: 'button' | 'submit' = 'button';

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
