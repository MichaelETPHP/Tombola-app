<script lang="ts">
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
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
  import { User, MessageCircle, ChevronLeft, ChevronRight, Pencil, Ticket as TicketIcon, Check, Info } from 'lucide-svelte';
  import { language, languages, setLanguage, type AppLanguage } from '$lib/stores/language.store.js';
  import { dicebearAvatarUri } from '$lib/utils/avatar.js';
  import { payments as paymentsStore, type PaymentHistoryItem } from '$lib/stores/payments.store.js';
  import { tickets as ticketsStore, type Ticket } from '$lib/stores/tickets.store.js';

  const pullRefresh = getPullRefreshContext();

  let statusLabels: Record<PaymentHistoryItem['status'], string>;
  $: statusLabels = {
    completed: $_('profile.paymentStatus.completed'),
    pending: $_('profile.paymentStatus.pending'),
    failed: $_('profile.paymentStatus.failed'),
    refunded: $_('profile.paymentStatus.refunded'),
  };
  const statusColors: Record<PaymentHistoryItem['status'], string> = {
    completed: 'bg-bg-start text-primary-dark',
    pending: 'bg-gold-bg text-gold',
    failed: 'bg-pink-bg text-pink',
    refunded: 'bg-dot-inactive text-muted',
  };

  let fullName = $auth.user?.fullName ?? '';
  let preferredLanguage: AppLanguage = $auth.user?.preferredLanguage ?? ($language === 'am' ? 'am' : 'en');
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
  const paymentsPageSize = 8;
  let paymentsPage = 0;
  $: paymentsPageCount = Math.max(1, Math.ceil(payments.length / paymentsPageSize));
  // A refresh can shrink the list out from under whatever page was showing.
  $: if (paymentsPage > paymentsPageCount - 1) paymentsPage = paymentsPageCount - 1;
  $: pagedPayments = payments.slice(paymentsPage * paymentsPageSize, (paymentsPage + 1) * paymentsPageSize);
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
      showBanner($_('profile.updatedBanner'));
      editOpen = false;
    } catch (err) {
      error = err instanceof ApiError ? $_('profile.updateError') : $_('login.networkError');
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
    showBanner($_('profile.logoutSuccessBanner'));
  }
</script>

{#if $auth.isLoading}
  <div class="flex flex-col gap-5" aria-busy="true" aria-label={$_('profile.loadingAria')}>
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
    <h1 class="font-display text-2xl font-semibold text-ink">{$_('profile.title')}</h1>

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
        <p class="truncate text-[15px] font-bold text-ink">{$auth.user?.fullName || $_('profile.addYourName')}</p>
        <p class="mt-0.5 text-xs text-muted">{$auth.user?.phone ?? ''}</p>
      </div>
      <button
        type="button"
        aria-label={editOpen ? $_('profile.closeEditAria') : $_('profile.editAria')}
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
      <form
        class="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card"
        transition:slide={{ duration: 220, easing: cubicOut }}
        on:submit|preventDefault={save}
      >
        <label for="name" class="text-[13px] font-semibold text-muted">{$_('profile.fullNameLabel')}</label>
        <input
          id="name"
          type="text"
          enterkeyhint="done"
          autocomplete="name"
          autocapitalize="words"
          spellcheck="true"
          maxlength="100"
          bind:value={fullName}
          placeholder={$_('profile.addYourName')}
          class="h-12 rounded-button border-none bg-bg-start px-4 font-sans text-[15px] text-ink outline-none ring-2 ring-transparent transition-[box-shadow] duration-150 ease-[var(--ease-out)] placeholder:text-muted focus:ring-primary"
        />

        <span class="text-[13px] font-semibold text-muted">{$_('profile.languageLabel')}</span>
        <div class="grid grid-cols-2 gap-2">
          {#each languages as opt (opt.code)}
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

        <Button type="submit" variant="secondary" loading={saving}>{$_('profile.saveChanges')}</Button>
      </form>
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
        <p class="text-sm font-semibold text-ink">{$_('profile.myRooms')}</p>
        <p class="text-xs text-muted">{$_('profile.myRoomsBody')}</p>
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
        <p class="text-sm font-semibold text-ink">{$_('tickets.title')}</p>
        <p class="text-xs text-muted">
          {tickets.length === 0
            ? $_('profile.ticketsSubtitleEmpty')
            : $_('profile.ticketsSubtitle', { values: { n: tickets.length, r: raffleCount } })}
        </p>
      </div>
      <ChevronRight size={16} class="shrink-0 text-muted" />
    </a>

    <a
      href="/about"
      on:click={hapticLight}
      class="tappable pressable flex items-center gap-3 rounded-card bg-card p-4 text-inherit no-underline shadow-card-light"
    >
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-start text-primary-dark">
        <Info size={18} />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-ink">{$_('profile.aboutYeneEta')}</p>
        <p class="text-xs text-muted">{$_('profile.aboutBody')}</p>
      </div>
      <ChevronRight size={16} class="shrink-0 text-muted" />
    </a>

    <section class="flex flex-col gap-3">
      <h2 class="font-display text-lg font-semibold text-ink">{$_('profile.paymentHistory')}</h2>
      {#if paymentsLoading}
        <div class="flex flex-col gap-3">
          <ListItemSkeleton />
          <ListItemSkeleton />
        </div>
      {:else if payments.length === 0}
        <p class="text-[13px] text-muted">{$_('profile.noPurchases')}</p>
      {:else}
        <div class="flex flex-col gap-3">
          {#each pagedPayments as payment (payment.id)}
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
                <span>{new Date(payment.createdAt).toLocaleDateString($language ?? undefined)}</span>
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

        {#if paymentsPageCount > 1}
          <nav class="flex items-center justify-center gap-4 pt-1" aria-label={$_('profile.paymentPagesAria')}>
            <button
              type="button"
              class="tappable pressable flex h-8 w-8 items-center justify-center rounded-full bg-card text-ink shadow-card-light disabled:opacity-35"
              disabled={paymentsPage === 0}
              on:click={() => (paymentsPage -= 1)}
              aria-label={$_('profile.previousPageAria')}
            >
              <ChevronLeft size={16} />
            </button>
            <span class="text-xs font-medium text-muted">{$_('profile.pageOf', { values: { n: paymentsPage + 1, total: paymentsPageCount } })}</span>
            <button
              type="button"
              class="tappable pressable flex h-8 w-8 items-center justify-center rounded-full bg-card text-ink shadow-card-light disabled:opacity-35"
              disabled={paymentsPage >= paymentsPageCount - 1}
              on:click={() => (paymentsPage += 1)}
              aria-label={$_('profile.nextPageAria')}
            >
              <ChevronRight size={16} />
            </button>
          </nav>
        {/if}
      {/if}
    </section>

    <Button variant="danger" on:click={logout}>{$_('profile.logOut')}</Button>
  </div>
{/if}
