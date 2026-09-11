<script lang="ts">
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { _ } from 'svelte-i18n';
  import {
    ArrowLeft,
    ChevronDown,
    Code2,
    Phone,
    Share2,
  } from 'lucide-svelte';
  import TikTokIcon from '$lib/components/TikTokIcon.svelte';
  import { hapticLight, hapticMedium } from '$lib/native/haptics.js';
  import { navigateBack } from '$lib/native/navigateBack.js';
  import { openExternal } from '$lib/native/browser.js';
  import { copyText, shareYeneEtaContent } from '$lib/native/capabilities.js';
  import { showBanner } from '$lib/stores/banner.store.js';

  const BOT_LINK = 'https://t.me/yeneEtabot/yeneeta';
  const TIKTOK_URL = 'https://www.tiktok.com/@yeneeta';

  $: faqs = [
    { question: $_('about.faq.enter.q'), answer: $_('about.faq.enter.a') },
    { question: $_('about.faq.howMany.q'), answer: $_('about.faq.howMany.a') },
    { question: $_('about.faq.whenNumbers.q'), answer: $_('about.faq.whenNumbers.a') },
    { question: $_('about.faq.winners.q'), answer: $_('about.faq.winners.a') },
    { question: $_('about.faq.reviewPayment.q'), answer: $_('about.faq.reviewPayment.a') },
  ];

  let openFaq: number | null = 0;
  let sharing = false;

  function goBack() {
    hapticLight();
    navigateBack();
  }

  function toggleFaq(index: number) {
    hapticLight();
    openFaq = openFaq === index ? null : index;
  }

  async function shareBot() {
    if (sharing) return;
    sharing = true;
    hapticMedium();
    try {
      await shareYeneEtaContent({
        title: 'YeneEta',
        text: $_('about.shareText'),
        url: BOT_LINK,
      });
    } catch {
      await copyText(BOT_LINK);
      showBanner($_('about.linkCopiedBanner'));
    } finally {
      sharing = false;
    }
  }

  function openTikTok() {
    hapticLight();
    openExternal(TIKTOK_URL);
  }
</script>

<svelte:head><title>{$_('about.pageTitle')}</title></svelte:head>

<div class="about-page flex flex-col gap-6">
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
      <h1 class="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">{$_('about.title')}</h1>
      <p class="mt-0.5 text-[11px] font-medium text-muted">{$_('about.subtitle')}</p>
    </div>
  </header>

  <section class="brand-panel relative overflow-hidden rounded-[24px] bg-[#123f35] px-5 py-6 text-white">
    <div class="brand-orbit pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full" aria-hidden="true"></div>
    <div class="relative flex items-center gap-3.5">
      <img
        src="/images/yeneeta-logo-mark.svg"
        alt=""
        width="52"
        height="52"
        class="h-[52px] w-[52px] rounded-[17px] bg-white object-cover shadow-[0_12px_28px_-15px_rgba(0,0,0,0.7)]"
      />
      <div>
        <p class="text-[20px] font-extrabold leading-none tracking-[-0.03em]">YeneEta</p>
        <p class="mt-1.5 text-[11px] font-semibold text-white/65">{$_('header.tagline')}</p>
      </div>
    </div>
    <p class="relative mt-5 max-w-[34ch] text-[13px] font-medium leading-[1.7] text-white/82">
      {$_('about.brandBody')}
    </p>
  </section>

  <section class="flex flex-col gap-3">
    <div>
      <h2 class="text-[17px] font-extrabold tracking-[-0.02em] text-ink">{$_('about.support')}</h2>
      <p class="mt-1 text-[10px] font-medium text-muted">{$_('about.supportBody')}</p>
    </div>
    <a
      href="tel:+251951043859"
      on:click={hapticLight}
      class="tappable pressable flex min-h-[72px] items-center gap-3.5 rounded-card bg-card p-4 text-inherit no-underline shadow-card-light"
      aria-label={$_('about.callAria')}
    >
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-action-bg text-primary-dark">
        <Phone size={19} />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-[11px] font-semibold text-muted">{$_('about.supportPhone')}</p>
        <p class="mt-0.5 text-[15px] font-extrabold tabular-nums text-ink">+251 95 104 3859</p>
      </div>
      <span class="rounded-full bg-bg-start px-3 py-1.5 text-[10px] font-extrabold text-primary-dark">{$_('about.call')}</span>
    </a>
  </section>

  <section class="share-panel overflow-hidden rounded-[22px] bg-card p-4 shadow-card-light">
    <div class="flex items-start gap-3">
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-bg text-[#815000]">
        <Share2 size={18} />
      </span>
      <div class="min-w-0 flex-1">
        <h2 class="text-[15px] font-extrabold text-ink">{$_('about.shareTitle')}</h2>
        <p class="mt-1 text-[11px] leading-relaxed text-muted">{$_('about.shareBody')}</p>
      </div>
    </div>
    <button
      type="button"
      disabled={sharing}
      on:click={shareBot}
      class="share-button tappable pressable mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[16px] bg-primary px-4 text-[13px] font-extrabold text-[#10211d] disabled:opacity-60"
    >
      <Share2 size={17} />
      {sharing ? $_('about.openingShare') : $_('about.shareTelegramLink')}
    </button>
    <p class="mt-2.5 truncate text-center text-[10px] font-medium text-muted">t.me/yeneEtabot/yeneeta</p>
  </section>

  <section class="flex flex-col gap-3">
    <div>
      <h2 class="text-[17px] font-extrabold tracking-[-0.02em] text-ink">{$_('about.officialChannels')}</h2>
      <p class="mt-1 text-[10px] font-medium text-muted">{$_('about.followAnnouncements')}</p>
    </div>
    <div class="grid grid-cols-3 gap-2.5">
      <button
        type="button"
        disabled
        class="channel flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[16px] bg-card text-muted shadow-card-light disabled:opacity-65"
        aria-label={$_('about.facebookComingSoonAria')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M13.7 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5H17V3.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.1H7.5V13h2.8v8h3.4Z" />
        </svg>
        <span class="text-[11px] font-bold">Facebook</span>
        <span class="text-[8px] font-bold uppercase tracking-[0.08em]">{$_('about.comingSoon')}</span>
      </button>
      <button
        type="button"
        on:click={openTikTok}
        class="channel tappable pressable flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[16px] bg-card text-ink shadow-card-light"
        aria-label={$_('about.tiktokAria')}
      >
        <TikTokIcon size={20} />
        <span class="text-[11px] font-bold">TikTok</span>
        <span class="text-[8px] font-bold uppercase tracking-[0.08em] text-primary-dark">@yeneeta</span>
      </button>
      <button
        type="button"
        disabled
        class="channel flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[16px] bg-card text-muted shadow-card-light disabled:opacity-65"
        aria-label={$_('about.youtubeComingSoonAria')}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21.6 7.2a3 3 0 0 0-2.1-2.1C17.6 4.6 12 4.6 12 4.6s-5.6 0-7.5.5a3 3 0 0 0-2.1 2.1A31 31 0 0 0 1.9 12c0 1.6.2 3.2.5 4.8a3 3 0 0 0 2.1 2.1c1.9.5 7.5.5 7.5.5s5.6 0 7.5-.5a3 3 0 0 0 2.1-2.1c.3-1.6.5-3.2.5-4.8s-.2-3.2-.5-4.8ZM10 15.2V8.8l5.5 3.2-5.5 3.2Z" />
        </svg>
        <span class="text-[11px] font-bold">YouTube</span>
        <span class="text-[8px] font-bold uppercase tracking-[0.08em]">{$_('about.comingSoon')}</span>
      </button>
    </div>
  </section>

  <section class="flex flex-col gap-3">
    <div>
      <h2 class="text-[17px] font-extrabold tracking-[-0.02em] text-ink">{$_('about.commonQuestions')}</h2>
      <p class="mt-1 text-[10px] font-medium text-muted">{$_('about.quickAnswers')}</p>
    </div>
    <div class="faq-list overflow-hidden rounded-[18px] bg-card shadow-card-light">
      {#each faqs as faq, index (faq.question)}
        <div class:border-t={index > 0} class="border-ink/5">
          <button
            type="button"
            class="tappable flex min-h-[58px] w-full items-center gap-3 px-4 py-3 text-left"
            aria-expanded={openFaq === index}
            aria-controls="faq-answer-{index}"
            on:click={() => toggleFaq(index)}
          >
            <span class="flex-1 text-[12.5px] font-bold leading-snug text-ink">{faq.question}</span>
            <ChevronDown
              size={17}
              class="shrink-0 text-primary-dark transition-transform duration-200 ease-[var(--ease-out)] {openFaq === index ? 'rotate-180' : ''}"
            />
          </button>
          {#if openFaq === index}
            <div id="faq-answer-{index}" transition:slide={{ duration: 220, easing: cubicOut }}>
              <p class="px-4 pb-4 pr-10 text-[11px] leading-[1.7] text-muted">{faq.answer}</p>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <footer class="mb-2 flex items-center justify-center gap-2 text-center text-[10px] font-semibold text-muted">
    <Code2 size={13} class="text-primary-dark" />
    <span>{$_('about.developedBy')} <strong class="font-extrabold text-ink">Michael & Masresha</strong></span>
  </footer>
</div>

<style>
  .about-page {
    animation: about-arrive 380ms var(--ease-out) both;
  }

  .brand-panel {
    box-shadow: 0 18px 38px -24px rgba(10, 59, 47, 0.68);
  }

  .brand-orbit {
    border: 30px solid rgba(86, 230, 190, 0.1);
    box-shadow: 0 0 0 22px rgba(86, 230, 190, 0.05);
  }

  .share-button {
    box-shadow: 0 11px 24px -16px rgba(0, 105, 80, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.62);
  }

  .channel {
    border: 1px solid rgba(255, 255, 255, 0.78);
  }

  @keyframes about-arrive {
    from { opacity: 0.72; transform: translateY(7px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .about-page { animation: none; }
    :global(.about-page .transition-transform) { transition-duration: 1ms; }
  }
</style>
