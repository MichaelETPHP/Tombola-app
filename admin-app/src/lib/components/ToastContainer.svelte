<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { toast } from '$lib/stores/toast.store.js';
  import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-svelte';
</script>

<div
  class="pointer-events-none fixed right-4 top-4 z-[9999] flex w-full max-w-sm flex-col gap-2.5 sm:right-6 sm:top-6"
  aria-live="polite"
>
  {#each $toast as item (item.id)}
    <div
      animate:flip={{ duration: 200 }}
      transition:fly={{ y: -16, duration: 220 }}
      class="pointer-events-auto flex items-start gap-3 rounded-[14px] border p-3.5 shadow-2xl backdrop-blur-md transition-all
        {item.type === 'success' ? 'border-success/30 bg-card text-ink' : ''}
        {item.type === 'error' ? 'border-danger/30 bg-card text-ink' : ''}
        {item.type === 'warning' ? 'border-warning/30 bg-card text-ink' : ''}
        {item.type === 'info' ? 'border-primary/30 bg-card text-ink' : ''}"
      role="alert"
    >
      <!-- Icon -->
      <span
        class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full
          {item.type === 'success' ? 'bg-success-bg text-success' : ''}
          {item.type === 'error' ? 'bg-danger-bg text-danger' : ''}
          {item.type === 'warning' ? 'bg-warning-bg text-warning' : ''}
          {item.type === 'info' ? 'bg-primary-bg text-primary' : ''}"
      >
        {#if item.type === 'success'}
          <CheckCircle2 size={16} strokeWidth={2.5} />
        {:else if item.type === 'error'}
          <AlertCircle size={16} strokeWidth={2.5} />
        {:else if item.type === 'warning'}
          <AlertTriangle size={16} strokeWidth={2.5} />
        {:else}
          <Info size={16} strokeWidth={2.5} />
        {/if}
      </span>

      <!-- Content -->
      <div class="min-w-0 flex-1">
        {#if item.title}
          <h4 class="text-xs font-bold tracking-tight text-ink">{item.title}</h4>
          <p class="mt-0.5 text-xs text-muted leading-relaxed break-words">{item.message}</p>
        {:else}
          <p class="text-xs font-semibold text-ink leading-relaxed break-words">{item.message}</p>
        {/if}
      </div>

      <!-- Close Button -->
      <button
        type="button"
        class="admin-press -mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-faint hover:bg-bg hover:text-ink transition-colors"
        aria-label="Dismiss notification"
        on:click={() => toast.dismiss(item.id)}
      >
        <X size={13} />
      </button>
    </div>
  {/each}
</div>
