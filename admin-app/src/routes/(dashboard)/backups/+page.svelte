<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.store.js';
  import { api, ApiError } from '$lib/api/client.js';
  import { toast } from '$lib/stores/toast.store.js';
  import { toEthiopianDateTime } from '$lib/utils/ethiopianDate.js';
  import { CircleAlert, DatabaseBackup, Download, RefreshCw, ShieldAlert } from 'lucide-svelte';

  interface BackupFile {
    filename: string;
    sizeBytes: number;
    createdAt: string;
  }

  let backups: BackupFile[] = [];
  let loading = true;
  let loadError = false;
  let runningBackup = false;
  let downloadingFilename: string | null = null;

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function loadBackups() {
    loading = true;
    loadError = false;
    try {
      const res = await api.get<{ backups: BackupFile[] }>('/admin/backups');
      backups = res.backups;
    } catch (err) {
      loadError = err instanceof ApiError;
      backups = [];
    } finally {
      loading = false;
    }
  }

  async function runBackupNow() {
    if (runningBackup) return;
    runningBackup = true;
    try {
      await api.post('/admin/backups/run', {});
      toast.success('The backup has been created and added to the list below.', 'Backup created');
      await loadBackups();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not run the backup.', 'Backup failed');
    } finally {
      runningBackup = false;
    }
  }

  async function downloadBackup(filename: string) {
    if (downloadingFilename) return;
    downloadingFilename = filename;
    try {
      const blob = await api.getBlob(`/admin/backups/${filename}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not download this backup.', 'Download failed');
    } finally {
      downloadingFilename = null;
    }
  }

  onMount(loadBackups);
</script>

<svelte:head><title>Database backups · 251 Lottery Admin</title></svelte:head>

{#if $auth.admin?.role !== 'owner'}
  <div class="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-card border border-border bg-card p-8 text-center">
    <CircleAlert size={24} class="text-danger" />
    <div>
      <p class="text-sm font-bold text-ink">Owner access required</p>
      <p class="mt-1 text-xs text-muted">Database backups are only visible to the platform owner.</p>
    </div>
  </div>
{:else}
  <div class="admin-reveal flex flex-col gap-6">
    <header class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p class="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">Data safety</p>
        <h1 class="text-[28px] font-bold tracking-[-0.03em] text-ink">Database backups</h1>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">
          A full backup of the platform's data runs automatically every night at midnight (Ethiopia time). The
          7 most recent nights are kept here — download any of them to your computer whenever you need to.
        </p>
      </div>
      <button
        type="button"
        class="admin-press flex h-10 items-center justify-center gap-2 rounded-button bg-sidebar px-4 text-xs font-bold text-white disabled:opacity-60"
        disabled={runningBackup}
        on:click={runBackupNow}
      >
        <DatabaseBackup size={15} class={runningBackup ? 'animate-pulse' : ''} />
        {runningBackup ? 'Backing up…' : 'Back up now'}
      </button>
    </header>

    {#if loading}
      <div class="space-y-3 rounded-card border border-border bg-card p-5">{#each Array(4) as _}<div class="h-12 animate-pulse rounded-button bg-bg"></div>{/each}</div>
    {:else if loadError}
      <section class="flex min-h-[260px] flex-col items-center justify-center rounded-card border border-dashed border-border bg-card px-6 text-center">
        <span class="mb-4 flex h-12 w-12 items-center justify-center rounded-[16px] bg-warning-bg text-warning"><ShieldAlert size={21} /></span>
        <h2 class="text-base font-bold text-ink">Backups could not be loaded</h2>
        <p class="mt-2 max-w-md text-sm leading-6 text-muted">Check the API connection and try again.</p>
        <button type="button" class="admin-press mt-5 flex h-10 items-center gap-2 rounded-button bg-sidebar px-4 text-xs font-bold text-white" on:click={loadBackups}><RefreshCw size={14} /> Try again</button>
      </section>
    {:else if backups.length === 0}
      <div class="rounded-card border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-faint">
        No backups yet — the first automatic one runs tonight at midnight, or click "Back up now" above.
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        {#each backups as backup (backup.filename)}
          <div class="flex items-center gap-3 rounded-card border border-border bg-card px-5 py-4">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-bg text-primary-dark"><DatabaseBackup size={16} /></span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-[13px] font-bold text-ink">{toEthiopianDateTime(backup.createdAt)}</p>
              <p class="mt-0.5 font-mono text-[11px] text-muted">{backup.filename} · {formatSize(backup.sizeBytes)}</p>
            </div>
            <button
              type="button"
              class="admin-press flex h-9 shrink-0 items-center gap-2 rounded-button border border-border bg-bg px-3 text-xs font-bold text-ink disabled:opacity-60"
              disabled={downloadingFilename === backup.filename}
              on:click={() => downloadBackup(backup.filename)}
            >
              <Download size={14} class={downloadingFilename === backup.filename ? 'animate-pulse' : ''} />
              {downloadingFilename === backup.filename ? 'Downloading…' : 'Download'}
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
