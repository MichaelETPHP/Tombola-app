<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import { toast } from '$lib/stores/toast.store.js';
  import { toEthiopianDateTime } from '$lib/utils/ethiopianDate.js';
  import { resolveImageUrl } from '$lib/utils/imageUrl.js';
  import DataTable from '$lib/components/DataTable.svelte';
  import { RefreshCw, Upload } from 'lucide-svelte';

  interface SplashSlide {
    slot: number;
    imageUrl: string;
    updatedAt: string;
  }

  let slides: SplashSlide[] = [];
  let loading = true;
  let loadError = false;
  let uploadingSlot: number | null = null;
  let fileInputs: Record<number, HTMLInputElement> = {};

  const columns = [
    { key: 'preview', label: 'Preview' },
    { key: 'slot', label: 'Slide' },
    { key: 'updatedAt', label: 'Last updated' },
    { key: 'actions', label: '' },
  ];

  function apiErrorMessage(err: unknown, fallback: string): string {
    if (!(err instanceof ApiError)) return 'Network error.';
    try {
      const body = JSON.parse(err.body) as { error?: string };
      return body.error || fallback;
    } catch {
      return fallback;
    }
  }

  async function load() {
    loading = true;
    loadError = false;
    try {
      const res = await api.get<{ slides: SplashSlide[] }>('/admin/splash');
      slides = res.slides;
    } catch {
      loadError = true;
    } finally {
      loading = false;
    }
  }
  onMount(load);

  function triggerFilePicker(slot: number) {
    fileInputs[slot]?.click();
  }

  async function onFileChosen(slot: number, e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // lets the same file be re-selected later if needed
    if (!file) return;
    uploadingSlot = slot;
    try {
      const formData = new FormData();
      formData.append('image', file);
      await api.upload(`/admin/splash/${slot}/image`, formData);
      toast.success(`Slide ${slot} updated — live for every user on their next app launch.`, 'Splash Screen');
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not update this slide.'), 'Upload Failed');
    } finally {
      uploadingSlot = null;
    }
  }
</script>

<svelte:head><title>Splash screen · 251 Lottery Admin</title></svelte:head>

<div class="admin-reveal">
  <header class="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
    <div>
      <p class="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">Branding</p>
      <h1 class="text-[28px] font-bold tracking-[-0.03em] text-ink">Splash screen</h1>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">
        Replace the two photos shown on the mobile app's opening screen. A change takes effect for every user the
        next time they open the app — no rebuild or app-store update needed.
      </p>
    </div>
    <button
      type="button"
      class="admin-press flex h-10 items-center justify-center gap-2 rounded-button border border-border bg-card px-4 text-xs font-bold text-ink"
      on:click={load}
    ><RefreshCw size={15} /> Refresh</button>
  </header>

  {#if loading}
    <div class="space-y-3 rounded-card border border-border bg-card p-5">
      {#each Array(2) as _}<div class="h-16 animate-pulse rounded-button bg-bg"></div>{/each}
    </div>
  {:else if loadError}
    <section class="flex min-h-[200px] flex-col items-center justify-center rounded-card border border-dashed border-border bg-card px-6 text-center">
      <p class="text-sm font-bold text-ink">Could not load the splash slides.</p>
      <button
        type="button"
        class="admin-press mt-4 flex h-10 items-center gap-2 rounded-button bg-sidebar px-4 text-xs font-bold text-white"
        on:click={load}
      ><RefreshCw size={14} /> Try again</button>
    </section>
  {:else}
    <DataTable {columns} rows={slides} emptyMessage="No slides found.">
      <svelte:fragment slot="cell" let:row let:column>
        {#if column === 'preview'}
          <img
            src={resolveImageUrl(row.imageUrl)}
            alt="Slide {row.slot} preview"
            class="h-20 w-12 rounded-button border border-border object-cover"
          />
        {:else if column === 'slot'}
          <span class="font-bold text-ink">Slide {row.slot}</span>
        {:else if column === 'updatedAt'}
          <span class="text-muted">{toEthiopianDateTime(row.updatedAt)}</span>
        {:else if column === 'actions'}
          <button
            type="button"
            disabled={uploadingSlot === row.slot}
            class="admin-press flex h-9 items-center gap-2 rounded-button border border-border bg-card px-3 text-xs font-bold text-ink disabled:opacity-60"
            on:click={() => triggerFilePicker(row.slot)}
          >
            <Upload size={14} /> {uploadingSlot === row.slot ? 'Uploading…' : 'Replace image'}
          </button>
          <input
            bind:this={fileInputs[row.slot]}
            type="file"
            accept="image/*"
            class="hidden"
            on:change={(e) => onFileChosen(row.slot, e)}
          />
        {/if}
      </svelte:fragment>
    </DataTable>
  {/if}
</div>
