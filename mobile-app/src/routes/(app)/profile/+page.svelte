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
  import TicketReceipt from '$lib/components/TicketReceipt.svelte';
  import { formatEtb } from '$lib/utils/currency.js';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { User, MessageCircle, ChevronRight, ChevronDown, Ticket as TicketIcon } from 'lucide-svelte';
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

  // Phone/OTP accounts have no profile photo at all — a generated
  // cartoon avatar reads far better than plain initials. Seeded by the
  // user's own id, so it's the same avatar every time, no storage needed.
  $: dicebearUri = $auth.user ? dicebearAvatarUri($auth.user.id) : '';

  // Seeded from the session cache — same reasoning as the Tickets page.
  let payments: PaymentHistoryItem[] = get(paymentsStore);
  let paymentsLoading = payments.length === 0;
  let hasFetchedPayments = false;

  let tickets: Ticket[] = get(ticketsStore);
  let ticketsLoading = tickets.length === 0;
  let hasFetchedTickets = false;
  let expandedTicketId: string | null = null;

  function toggleTicket(id: string) {
    hapticLight();
    expandedTicketId = expandedTicketId === id ? null : id;
  }

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
    if (tickets.length === 0) ticketsLoading = true;
    try {
      const res = await api.get<{ tickets: Ticket[] }>('/tickets');
      tickets = res.tickets;
      ticketsStore.set(res.tickets);
    } catch (err) {
      console.error('Failed to load tickets', err);
    } finally {
      ticketsLoading = false;
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
    } catch (err) {
      error = err instanceof ApiError ? 'Could not update profile.' : 'Network error.';
    } finally {
      saving = false;
    }
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
  <div class="flex flex-col gap-5">
    <Skeleton class="h-6 w-24 rounded-full" />
    <div class="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card">
      <Skeleton class="h-11 w-full rounded-button" />
      <Skeleton class="h-11 w-full rounded-button" />
      <Skeleton class="h-11 w-full rounded-button" />
    </div>
  </div>
{:else if $auth.isAuthenticated}
  <div class="flex flex-col gap-5">
    <h1 class="font-display text-2xl font-semibold text-ink">Profile</h1>

    <div class="flex flex-col items-center gap-2 py-1">
      <div
        class="flex h-20 w-20 items-center justify-center rounded-full bg-bg-start text-2xl font-bold text-primary-dark shadow-card"
      >
        {#if $auth.user?.telegramPhotoUrl || dicebearUri}
          <img
            src={$auth.user?.telegramPhotoUrl || dicebearUri}
            alt=""
            class="h-full w-full rounded-full object-cover"
          />
        {:else}
          <User size={32} />
        {/if}
      </div>
    </div>

    <div class="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card">
      <label for="phone" class="text-[13px] font-semibold text-muted">Phone number</label>
      <input
        id="phone"
        type="text"
        value={$auth.user?.phone ?? ''}
        disabled
        class="h-12 rounded-button border-none bg-bg-start px-4 font-sans text-[15px] text-muted disabled:cursor-not-allowed"
      />

      <label for="name" class="text-[13px] font-semibold text-muted">Full name</label>
      <input
        id="name"
        type="text"
        bind:value={fullName}
        placeholder="Add your name"
        class="h-12 rounded-button border-none bg-bg-start px-4 font-sans text-[15px] text-ink outline-none ring-2 ring-transparent transition-[box-shadow] duration-150 ease-[var(--ease-out)] placeholder:text-muted focus:ring-primary"
      />

      <label for="language" class="text-[13px] font-semibold text-muted">Language</label>
      <select
        id="language"
        bind:value={preferredLanguage}
        class="h-12 rounded-button border-none bg-bg-start px-4 font-sans text-[15px] text-ink outline-none ring-2 ring-transparent focus:ring-primary"
      >
        <option value="en">English</option>
        <option value="am">አማርኛ</option>
      </select>

      {#if error}
        <p class="text-[13px] text-coral-start">{error}</p>
      {/if}

      <Button variant="secondary" loading={saving} on:click={save}>Save changes</Button>
    </div>

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

    <section class="flex flex-col gap-3">
      <h2 class="font-display text-lg font-semibold text-ink">My tickets</h2>
      {#if ticketsLoading}
        <div class="flex flex-col gap-3">
          <ListItemSkeleton />
          <ListItemSkeleton />
        </div>
      {:else if tickets.length === 0}
        <p class="text-[13px] text-muted">You haven't bought any tickets yet.</p>
      {:else}
        <div class="flex flex-col gap-2.5">
          {#each tickets as ticket (ticket.id)}
            {@const expanded = expandedTicketId === ticket.id}
            <div class="overflow-hidden rounded-card bg-card shadow-card-light">
              <button
                type="button"
                on:click={() => toggleTicket(ticket.id)}
                aria-expanded={expanded}
                class="tappable flex w-full items-center gap-3 p-4 text-left"
              >
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-start text-primary-dark">
                  <TicketIcon size={17} />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-ink">{ticket.raffleTitle ?? 'Raffle'}</p>
                  <p class="mt-0.5 font-mono text-xs text-muted">{ticket.ticketCode ?? `#${ticket.ticketNumber}`}</p>
                </div>
                <ChevronDown
                  size={16}
                  class="shrink-0 text-muted transition-transform duration-200 ease-[var(--ease-out)] {expanded ? 'rotate-180' : ''}"
                />
              </button>
              {#if expanded}
                <div transition:slide={{ duration: 220, easing: cubicOut }}>
                  <div class="border-t border-dot-inactive/60 p-4 pt-3">
                    <TicketReceipt
                      raffleTitle={ticket.raffleTitle ?? 'Raffle'}
                      ticketCode={ticket.ticketCode ?? `#${ticket.ticketNumber}`}
                      ticketNumber={ticket.ticketNumber}
                      amount={ticket.amount ?? 0}
                      purchasedAt={ticket.createdAt}
                      expiresAt={ticket.expiresAt}
                    />
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

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
