<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.store.js';
  import { api, ApiError } from '$lib/api/client.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { CircleAlert, CreditCard, Info, MessageCircle, Plug, RefreshCw, Wallet } from 'lucide-svelte';

  type IntegrationMode = 'mock' | 'live' | 'unconfigured' | 'not_implemented';

  interface Integration {
    key: string;
    name: string;
    mode: IntegrationMode;
    detail: string;
  }

  const icons: Record<string, typeof MessageCircle> = {
    otp: MessageCircle,
    chapa: CreditCard,
    telebirr: Wallet,
  };

  let integrations: Integration[] = [];
  let loading = true;
  let loadError = false;

  async function load() {
    loading = true;
    loadError = false;
    try {
      const res = await api.get<{ integrations: Integration[] }>('/admin/integrations');
      integrations = res.integrations;
    } catch (err) {
      loadError = true;
      console.error('Failed to load integrations', err);
    } finally {
      loading = false;
    }
  }

  onMount(load);
</script>

<svelte:head><title>Integrations | Tombola Admin</title></svelte:head>

{#if $auth.admin?.role !== 'owner'}
  <div class="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-card border border-border bg-card p-8 text-center">
    <CircleAlert size={24} class="text-danger" />
    <div>
      <p class="text-sm font-bold text-ink">Owner access required</p>
      <p class="mt-1 text-xs text-muted">Integration status is only visible to the platform owner.</p>
    </div>
  </div>
{:else}
  <div class="flex flex-col gap-6">
    <header class="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <div class="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-dark">
          <Plug size={14} /> Platform integrations
        </div>
        <h1 class="text-[28px] font-extrabold leading-none tracking-[-0.04em] text-ink md:text-[34px]">Integrations</h1>
        <p class="mt-2 max-w-[560px] text-sm leading-relaxed text-muted">
          Status of every external service the platform depends on — read-only. Real credentials are set as
          deployment environment variables, never through this page.
        </p>
      </div>
    </header>

    {#if loading}
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each Array(3) as _}
          <div class="h-40 animate-pulse rounded-card bg-border"></div>
        {/each}
      </div>
    {:else if loadError}
      <div class="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-card border border-border bg-card p-8 text-center">
        <CircleAlert size={24} class="text-danger" />
        <div>
          <p class="text-sm font-bold text-ink">Integrations could not be loaded</p>
          <p class="mt-1 text-xs text-muted">Check the API connection and try again.</p>
        </div>
        <button class="admin-press inline-flex h-10 items-center gap-2 rounded-button border border-border px-4 text-xs font-bold" on:click={load}>
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    {:else}
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each integrations as integration (integration.key)}
          <div class="flex flex-col gap-3 rounded-card border border-border bg-card p-5">
            <div class="flex items-center justify-between">
              <span class="flex h-10 w-10 items-center justify-center rounded-[12px] bg-primary-bg text-primary-dark">
                <svelte:component this={icons[integration.key] ?? Plug} size={18} strokeWidth={2} />
              </span>
              <StatusBadge status={integration.mode} />
            </div>
            <div>
              <p class="text-sm font-bold text-ink">{integration.name}</p>
              <p class="mt-1.5 text-xs leading-relaxed text-muted">{integration.detail}</p>
            </div>
          </div>
        {/each}
      </div>

      <div class="flex items-start gap-3 rounded-card border border-border bg-card p-4">
        <Info size={16} class="mt-0.5 shrink-0 text-primary-dark" />
        <p class="text-xs leading-relaxed text-muted">
          To go live on any of these, set the real credentials as environment variables on the API service in your
          deployment (Coolify, or wherever it's hosted) and flip the matching mock flag off, then redeploy — see
          <code class="rounded bg-border px-1 py-0.5 font-mono text-[11px] text-ink">deploy/COOLIFY.md</code> in the repo.
        </p>
      </div>
    {/if}
  </div>
{/if}
