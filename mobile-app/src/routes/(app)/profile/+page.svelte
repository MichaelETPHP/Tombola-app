<script lang="ts">
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth, clearAuth } from '$lib/stores/auth.store.js';
  import { showBanner } from '$lib/stores/banner.store.js';
  import { hapticLight, hapticMedium } from '$lib/native/haptics.js';
  import Button from '$lib/components/Button.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ListItemSkeleton from '$lib/components/ListItemSkeleton.svelte';
  import { formatEtb } from '$lib/utils/currency.js';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { User, MessageCircle, ChevronRight, Pencil, Ticket as TicketIcon, Check } from 'lucide-svelte';
  import { language, setLanguage, type AppLanguage } from '$lib/stores/language.store.js';
  import { dicebearAvatarUri } from '$lib/utils/avatar.js';
  import { payments as paymentsStore, type PaymentHistoryItem } from '$lib/stores/payments.store.js';
  import { tickets as ticketsStore, type Ticket } from '$lib/stores/tickets.store.js';

  const pullRefresh = getPullRefreshContext();

  const statusLabels: Record<PaymentHistoryItem['status'], string> = {
    completed: 'Paid',
    pending: 'Processing',
    failed: 'Failed',
    refunded: 'Refunded',
  };
  const statusColors: Record<PaymentHistoryItem['status'], string> = {
    completed: 'bg-bg-start text-primary-dark',
    pending: 'bg-gold-bg text-gold',
    failed: 'bg-pink-bg text-pink',
    refunded: 'bg-dot-inactive text-muted',
  };

  let fullName = $auth.user?.fullName ?? '';
  let preferredLanguage: AppLanguage = $auth.user?.preferredLanguage ?? $language;
  let saving = false;
  let error = '';
  let editOpen = false;

  // Phone/OTP accounts have no profile photo at all — a generated
  // cartoon avatar reads far better than plain initials. Seeded by the
  // user's own id, so it's the same avatar every time, no storage needed.
  $: dicebearUri = $auth.user ? dicebearAvatarUri($auth.user.id) : '';

  // Seeded from the session cache — same reasoning as the Tickets page.
  let payments: PaymentHistoryItem[] = get(paymentsStore);
  let paymentsLoading = payments.length === 0;
  let hasFetchedPayments = false;

  // Only fetched here to power "My tickets" link card's live count — the
  // full list/receipts live on the dedicated /tickets page now, not inline
  // on Profile (it made this page too long to scroll through).
  let tickets: Ticket[] = get(ticketsStore);
  let hasFetchedTickets = false;
  $: raffleCount = new Set(tickets.map((t) => t.raffleId)).size;

  $: if (!$auth.isLoading && !$auth.isAuthenticated) {
    goto('/login?returnTo=/profile', { replaceState: true });
  }

  async function loadPayments() {
    if (payments.length === 0) paymentsLoading = true;
    try {
      const res = await api.get<{ payments: PaymentHistoryItem[] }>('/payments/mine');
      payments = res.payments;
      paymentsStore.set(res.payments);
    } catch (err) {
      console.error('Failed to load payment history', err);
    } finally {
      paymentsLoading = false;
    }
  }

  async function loadTickets() {
    try {
      const res = await api.get<{ tickets: Ticket[] }>('/tickets');
      tickets = res.tickets;
      ticketsStore.set(res.tickets);
    } catch (err) {
      console.error('Failed to load tickets', err);
    }
  }

  // Reactive rather than onMount — same reason as wins/tickets: the root
  // layout's silent-refresh can still be in flight when this page mounts.
  $: if ($auth.isAuthenticated && !hasFetchedPayments) {
    hasFetchedPayments = true;
    loadPayments();
  }
  $: if ($auth.isAuthenticated && !hasFetchedTickets) {
    hasFetchedTickets = true;
    loadTickets();
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([loadPayments(), loadTickets()]);
  }

  $: pullRefresh.set($auth.isAuthenticated ? refreshAll : null);

  async function save() {
    error = '';
    saving = true;
    try {
      const res = await api.patch<{ user: typeof $auth.user }>('/users/me', {
        fullName: fullName.trim(),
        preferredLanguage,
      });
      auth.update((state) => ({ ...state, user: res.user }));
      setLanguage(preferredLanguage);
      hapticMedium();
      showBanner('Profile updated');
      editOpen = false;
    } catch (err) {
      error = err instanceof ApiError ? 'Could not update profile.' : 'Network error.';
    } finally {
      saving = false;
    }
  }

  function toggleEdit() {
    hapticLight();
    editOpen = !editOpen;
  }

  async function logout() {
    hapticLight();
    try {
      // Best-effort — clears the httpOnly refresh cookie server-side so
      // reopening the app doesn't silently sign back in. Local state below
      // still clears even if this fails; the user's intent to log out
      // shouldn't depend on the network.
      await api.post('/auth/logout', undefined, { skipAuth: true });
    } catch {
      // ignore — see above
    }
    clearAuth();
    // Navigate first so the root-level banner appears on the login screen,
    // matching the existing successful-login notification sequence.
    await goto('/login', { replaceState: true });
    showBanner('Logout successful');
  }
</script>

{#if $auth.isLoading}
  <div class="flex flex-col gap-5" aria-busy="true" aria-label="Loading profile">
    <Skeleton class="h-7 w-28 rounded-full" />

    <div class="flex items-center gap-3.5 rounded-card bg-card p-4 shadow-card">
      <Skeleton class="h-14 w-14 shrink-0 rounded-full" />
      <div class="flex flex-1 flex-col gap-2">
        <Skeleton class="h-4 w-2/5 rounded-full" />
        <Skeleton class="h-3 w-1/3 rounded-full" />
      </div>
      <Skeleton class="h-10 w-10 shrink-0 rounded-full" />
    </div>

    <ListItemSkeleton />
    <ListItemSkeleton />

    <div class="flex flex-col gap-3">
      <Skeleton class="h-5 w-36 rounded-full" />
      <ListItemSkeleton />
      <ListItemSkeleton />
    </div>
  </div>
{:else if $auth.isAuthenticated}
  <div class="flex flex-col gap-5">
    <h1 class="font-display text-2xl font-semibold text-ink">Profile</h1>

    <!-- Compact identity row — avatar, name and phone read at a glance;
         editing is opt-in via the pencil rather than always taking a full
         card's worth of space. -->
    <div class="flex items-center gap-3.5 rounded-card bg-card p-4 shadow-card">
      <div
        class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-bg-start text-lg font-bold text-primary-dark"
      >
        {#if $auth.user?.telegramPhotoUrl || dicebearUri}
          <img
            src={$auth.user?.telegramPhotoUrl || dicebearUri}
            alt=""
            class="h-full w-full rounded-full object-cover"
          />
        {:else}
          <User size={24} />
        {/if}
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-[15px] font-bold text-ink">{$auth.user?.fullName || 'Add your name'}</p>
        <p class="mt-0.5 text-xs text-muted">{$auth.user?.phone ?? ''}</p>
      </div>
      <button
        type="button"
        aria-label={editOpen ? 'Close edit profile' : 'Edit profile'}
        aria-expanded={editOpen}
        on:click={toggleEdit}
        class="tappable pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full {editOpen
          ? 'bg-primary text-white'
          : 'bg-bg-start text-primary-dark'}"
      >
        <Pencil size={15} />
      </button>
    </div>

    {#if editOpen}
      <div
        class="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card"
        transition:slide={{ duration: 220, easing: cubicOut }}
      >
        <label for="name" class="text-[13px] font-semibold text-muted">Full name</label>
        <input
          id="name"
          type="text"
          bind:value={fullName}
          placeholder="Add your name"
          class="h-12 rounded-button border-none bg-bg-start px-4 font-sans text-[15px] text-ink outline-none ring-2 ring-transparent transition-[box-shadow] duration-150 ease-[var(--ease-out)] placeholder:text-muted focus:ring-primary"
        />

        <span class="text-[13px] font-semibold text-muted">Language</span>
        <div class="grid grid-cols-2 gap-2">
          {#each [{ code: 'en', label: 'English' }, { code: 'am', label: 'አማርኛ' }] as opt (opt.code)}
            <button
              type="button"
              on:click={() => (preferredLanguage = opt.code as AppLanguage)}
              class="tappable pressable flex h-11 items-center justify-center gap-1.5 rounded-button text-[13px] font-semibold {preferredLanguage ===
              opt.code
                ? 'bg-primary/15 text-primary-dark ring-1 ring-primary/40'
                : 'bg-bg-start text-muted'}"
            >
              {#if preferredLanguage === opt.code}<Check size={13} />{/if}
              {opt.label}
            </button>
          {/each}
        </div>

        {#if error}
          <p class="text-[13px] text-coral-start">{error}</p>
        {/if}

        <Button variant="secondary" loading={saving} on:click={save}>Save changes</Button>
      </div>
    {/if}

    <a
      href="/rooms"
      on:click={hapticLight}
      class="tappable pressable flex items-center gap-3 rounded-card bg-card p-4 text-inherit no-underline shadow-card-light"
    >
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-start text-primary-dark">
        <MessageCircle size={18} />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-ink">My Rooms</p>
        <p class="text-xs text-muted">Chat with buyers in raffles you've bought tickets for</p>
      </div>
      <ChevronRight size={16} class="shrink-0 text-muted" />
    </a>

    <a
      href="/tickets"
      on:click={hapticLight}
      class="tappable pressable flex items-center gap-3 rounded-card bg-card p-4 text-inherit no-underline shadow-card-light"
    >
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-start text-primary-dark">
        <TicketIcon size={18} />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-ink">My Tickets</p>
        <p class="text-xs text-muted">
          {tickets.length === 0
            ? 'Your ticket numbers and receipts'
            : `${tickets.length} ticket${tickets.length === 1 ? '' : 's'} across ${raffleCount} raffle${raffleCount === 1 ? '' : 's'}`}
        </p>
      </div>
      <ChevronRight size={16} class="shrink-0 text-muted" />
    </a>

    <section class="flex flex-col gap-3">
      <h2 class="font-display text-lg font-semibold text-ink">Payment history</h2>
      {#if paymentsLoading}
        <div class="flex flex-col gap-3">
          <ListItemSkeleton />
          <ListItemSkeleton />
        </div>
      {:else if payments.length === 0}
        <p class="text-[13px] text-muted">No purchases yet.</p>
      {:else}
        <div class="flex flex-col gap-3">
          {#each payments as payment (payment.id)}
            <a
              href="/raffles/{payment.raffleId}"
              class="tappable flex flex-col gap-2 rounded-card bg-card p-4 text-inherit no-underline shadow-card-light"
            >
              <div class="flex items-start justify-between gap-2">
                <span class="text-sm font-semibold text-ink">{payment.raffleTitle}</span>
                <span
                  class="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold {statusColors[
                    payment.status
                  ]}"
                >
                  {statusLabels[payment.status]}
                </span>
              </div>
              <div class="flex items-center justify-between text-xs text-muted">
                <span>{new Date(payment.createdAt).toLocaleDateString()}</span>
                <span class="font-semibold text-ink">{formatEtb(payment.amount)} ETB</span>
              </div>
              {#if payment.ticketCodes.length > 0}
                <div class="flex flex-wrap gap-1.5">
                  {#each payment.ticketCodes as code (code)}
                    <span class="rounded-full bg-bg-start px-2 py-0.5 font-mono text-[10px] font-semibold text-primary-dark">
                      {code}
                    </span>
                  {/each}
                </div>
              {/if}
            </a>
          {/each}
        </div>
      {/if}
    </section>

    <Button variant="danger" on:click={logout}>Log out</Button>
  </div>
{/if}
