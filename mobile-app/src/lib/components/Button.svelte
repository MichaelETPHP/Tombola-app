<script lang="ts">
  export let variant: 'primary' | 'secondary' | 'ghost' = 'primary';
  export let size: 'md' | 'lg' = 'md';
  export let disabled = false;
  export let loading = false;
  export let type: 'button' | 'submit' = 'button';
</script>

<button
  {type}
  class="btn {variant} {size} pressable"
  disabled={disabled || loading}
  on:click
>
  {#if loading}
    <span class="spinner" aria-hidden="true"></span>
  {/if}
  <slot />
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-8);
    width: 100%;
    border: none;
    border-radius: var(--radius-button);
    font-family: var(--font-family);
    font-weight: 600;
    cursor: pointer;
  }

  .btn.md {
    height: 44px;
    font-size: 15px;
    padding: 0 var(--space-20);
  }

  .btn.lg {
    height: 52px;
    font-size: 16px;
    padding: 0 var(--space-24);
  }

  .btn.primary {
    background: linear-gradient(135deg, var(--color-coral-start) 0%, var(--color-coral-end) 100%);
    color: #ffffff;
    box-shadow: 0 6px 16px rgba(255, 107, 107, 0.35);
  }

  .btn.secondary {
    background: var(--color-card-bg);
    color: var(--color-text-primary);
    box-shadow: var(--shadow-card-light);
  }

  .btn.ghost {
    background: transparent;
    color: var(--color-primary-dark);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .btn.secondary .spinner,
  .btn.ghost .spinner {
    border-color: rgba(0, 0, 0, 0.15);
    border-top-color: var(--color-primary-dark);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
