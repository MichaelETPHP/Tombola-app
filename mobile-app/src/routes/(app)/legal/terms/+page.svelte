<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { ArrowLeft } from 'lucide-svelte';
  import { hapticLight } from '$lib/native/haptics.js';
  import { navigateBack } from '$lib/native/navigateBack.js';

  const LAST_UPDATED = 'September 17, 2026';

  function goBack() {
    hapticLight();
    navigateBack();
  }
</script>

<svelte:head><title>Terms of Service · 251 Lottery</title></svelte:head>

<div class="legal-page flex flex-col gap-6">
  <header class="flex items-center gap-3">
    <button
      type="button"
      aria-label={$_('about.backAria')}
      on:click={goBack}
      class="tappable pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-primary-dark shadow-card-light"
    >
      <ArrowLeft size={19} />
    </button>
    <div>
      <h1 class="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">Terms of Service</h1>
      <p class="mt-0.5 text-[11px] font-medium text-muted">Last updated {LAST_UPDATED}</p>
    </div>
  </header>

  <div class="legal-copy flex flex-col gap-6 rounded-card bg-card p-5 shadow-card-light">
    <p class="text-[13px] leading-[1.8] text-muted">
      These terms govern your use of 251 Lottery, operated by 251 Technology. By creating an account or buying a
      ticket, you agree to them.
    </p>

    <section>
      <h2>1. Eligibility</h2>
      <p>
        You must be 18 or older to create an account or purchase a ticket, and you must provide a valid Ethiopian
        phone number. One account is allowed per phone number, regardless of whether you sign in by phone or
        Telegram.
      </p>
    </section>

    <section>
      <h2>2. Your account</h2>
      <p>
        Keep your one-time verification code private — 251 Lottery staff will never ask you for it. Signing in on a
        new device ends your session on the previous one. You're responsible for activity on your account.
      </p>
    </section>

    <section>
      <h2>3. How raffles work</h2>
      <ul>
        <li>Each raffle displays its own ticket price and the maximum tickets one person may hold for it</li>
        <li>Every paid ticket is one independent, numbered entry in that raffle's draw</li>
        <li>Draws are provably fair: the result is produced from a published method that can be independently verified after the draw completes — nothing is decided behind closed doors</li>
        <li>A raffle's deadline, prize tiers and ticket cap are fixed once tickets are on sale and won't change under you</li>
      </ul>
    </section>

    <section>
      <h2>4. Payments</h2>
      <p>
        Payments are processed by Telebirr, M-PESA or Chapa. A purchase is final once payment is confirmed and
        ticket numbers are issued — we don't offer refunds for a completed purchase, except where a technical fault
        on our side prevented tickets from being issued at all, at our discretion.
      </p>
    </section>

    <section>
      <h2>5. Winning and claiming a prize</h2>
      <ul>
        <li>If your ticket wins, you'll be notified in the app and by SMS</li>
        <li>Claiming a prize requires submitting a photo of a government-issued ID within the claim window shown on your Wins page — miss that window and the claim can no longer be processed</li>
        <li>We review every claim before releasing a prize; we may ask for more information or decline a claim that fails verification</li>
        <li>Cash prizes are paid out net of applicable withholding tax, as required by Ethiopian tax law</li>
      </ul>
    </section>

    <section>
      <h2>6. Rules of conduct</h2>
      <p>
        Don't use a fraudulent phone number, a fraudulent payment method, or more than one account to get around
        ticket limits. We may suspend or close an account that does, and withhold a prize obtained that way.
      </p>
    </section>

    <section>
      <h2>7. Room messages</h2>
      <p>
        Messages you post in a raffle's group room are visible to everyone who bought a ticket for that raffle.
        Keep them relevant and respectful — we may remove a message or restrict a user who doesn't.
      </p>
    </section>

    <section>
      <h2>8. Suspension and termination</h2>
      <p>
        We may suspend or close an account that violates these terms. You can ask us to close your account at any
        time by contacting support.
      </p>
    </section>

    <section>
      <h2>9. Changes to these terms</h2>
      <p>
        We may update these terms as the platform evolves. If we make a material change, we'll update the date at
        the top of this page.
      </p>
    </section>

    <section>
      <h2>10. Governing law</h2>
      <p>These terms are governed by the laws of Ethiopia.</p>
    </section>

    <section>
      <h2>11. Contact</h2>
      <p>Questions about these terms can be sent to our support line, listed on the About page.</p>
    </section>
  </div>
</div>

<style>
  .legal-page {
    animation: legal-arrive 380ms var(--ease-out) both;
  }

  .legal-copy section + section {
    margin-top: 20px;
  }

  .legal-copy :global(h2) {
    font-size: 14px;
    font-weight: 800;
    letter-spacing: -0.01em;
    color: var(--color-ink);
    margin-bottom: 8px;
  }

  .legal-copy :global(p) {
    font-size: 12.5px;
    line-height: 1.75;
    color: var(--color-muted);
  }

  .legal-copy :global(p + p) {
    margin-top: 10px;
  }

  .legal-copy :global(ul) {
    margin-top: 4px;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .legal-copy :global(li) {
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--color-muted);
    list-style: disc;
  }

  @keyframes legal-arrive {
    from { opacity: 0.72; transform: translateY(7px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .legal-page { animation: none; }
  }
</style>
