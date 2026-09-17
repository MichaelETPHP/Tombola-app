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

<svelte:head><title>Privacy Policy · 251 Lottery</title></svelte:head>

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
      <h1 class="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">Privacy Policy</h1>
      <p class="mt-0.5 text-[11px] font-medium text-muted">Last updated {LAST_UPDATED}</p>
    </div>
  </header>

  <div class="legal-copy flex flex-col gap-6 rounded-card bg-card p-5 shadow-card-light">
    <p class="text-[13px] leading-[1.8] text-muted">
      This policy explains what information 251 Lottery ("we", "us") collects when you use the app, why we collect
      it, and the choices you have. By using 251 Lottery, you agree to the practices described here.
    </p>

    <section>
      <h2>1. Information we collect</h2>
      <p><strong>Account information.</strong> Your phone number, used to verify your identity by one-time code and to send account-related SMS. If you sign in with Telegram, we also receive your Telegram name, username and profile photo. If you add a full name to your profile, we store that too.</p>
      <p><strong>Raffle activity.</strong> The tickets you purchase, the raffles you enter, and your draw results.</p>
      <p><strong>Payment information.</strong> Payments are processed by licensed third-party gateways (Telebirr, M-PESA, Chapa). We store the transaction reference, amount and status — never your card number, PIN or full account credentials, which those providers handle directly.</p>
      <p><strong>Prize-claim documents.</strong> If you win, verifying your identity requires a photo of a government-issued ID (National ID or Kebele ID). This is the most sensitive information we ever ask for, and it is treated accordingly — see "How we protect ID documents" below.</p>
      <p><strong>Messages.</strong> Messages you send in a raffle's group room are visible to everyone else who bought a ticket for that raffle.</p>
      <p><strong>Technical data.</strong> If the app encounters an error, we log the error message, the screen it happened on and basic technical details (like app version) so we can fix it. These logs are not linked to your ID documents or payment details.</p>
    </section>

    <section>
      <h2>2. How we use your information</h2>
      <ul>
        <li>To verify your identity and keep your account secure</li>
        <li>To operate raffles: issue ticket numbers, run draws, and deliver prizes</li>
        <li>To send SMS you'd expect: verification codes, purchase confirmations, draw results, and prize-claim updates</li>
        <li>To review and fulfil prize claims, including verifying the ID document you submit</li>
        <li>To investigate fraud, fraudulent payment methods, or abuse of the ticket limits</li>
        <li>To diagnose and fix technical problems</li>
      </ul>
    </section>

    <section>
      <h2>3. How we protect ID documents</h2>
      <p>
        A submitted ID photo is stored separately from every other kind of file in the app and is never reachable
        through a public link. Only you and the staff reviewing your specific claim can access it. It is used solely
        to confirm you are the person entitled to the prize.
      </p>
    </section>

    <section>
      <h2>4. Who we share information with</h2>
      <p>
        We do not sell your information. We share only what's necessary to operate the service: payment gateways
        (Telebirr, M-PESA, Chapa) to process a purchase, our SMS provider to deliver messages, and Telegram if you
        choose to sign in that way. We may disclose information if required by Ethiopian law or a valid legal
        request.
      </p>
    </section>

    <section>
      <h2>5. How long we keep information</h2>
      <p>
        We keep account and ticket records for as long as your account is active and for a reasonable period after,
        to meet legal, tax and dispute-resolution obligations. Technical error logs are kept for a limited time and
        then removed.
      </p>
    </section>

    <section>
      <h2>6. Your choices</h2>
      <p>
        You can review your ticket and payment history at any time from your Profile. To request a copy of your
        data, ask a question, or request that your account be closed, contact support using the phone number on the
        About page — we'll respond from there.
      </p>
    </section>

    <section>
      <h2>7. Children</h2>
      <p>251 Lottery is for adults. You must be 18 or older to create an account or purchase a ticket.</p>
    </section>

    <section>
      <h2>8. Changes to this policy</h2>
      <p>
        If we make a material change to how we handle your information, we'll update the date at the top of this
        page and, where appropriate, notify you in the app.
      </p>
    </section>

    <section>
      <h2>9. Contact</h2>
      <p>Questions about this policy can be sent to our support line, listed on the About page.</p>
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
