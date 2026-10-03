<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { Send, ArrowUpRight } from 'lucide-svelte';

  const BOT_LINK = 'https://t.me/lottery251_bot';
</script>

<!--
  This app has never had a desktop layout (see app.css --app-max-width):
  a stray browser tab just letterboxes the phone-sized frame on a dark
  stage and leaves the rest of the viewport empty. This is the one thing
  that belongs in that empty stage — a way back to where the app is
  actually meant to be used. Deliberately NOT given the .app-frame-fixed
  treatment every other fixed element gets: those re-cap to the phone
  frame on purpose, this one anchors to the true viewport edge instead,
  which is what puts it in the backdrop rather than inside the frame.
-->
<a
  href={BOT_LINK}
  target="_blank"
  rel="noopener noreferrer"
  class="desktop-telegram-prompt fixed bottom-8 right-8 z-40 items-center gap-3 rounded-full py-2.5 pl-2.5 pr-4 text-white no-underline"
  aria-label={$_('desktopPrompt.aria')}
>
  <span class="relative flex h-11 w-11 shrink-0 items-center justify-center">
    <span class="telegram-ring absolute inset-0 rounded-full" aria-hidden="true"></span>
    <span class="telegram-badge relative flex h-11 w-11 items-center justify-center rounded-full text-white">
      <Send size={18} strokeWidth={2.25} />
    </span>
  </span>
  <span class="text-[14px] font-extrabold tracking-[-0.01em]">{$_('desktopPrompt.cta')}</span>
  <ArrowUpRight size={15} class="shrink-0 text-white/55" />
</a>

<style>
  .desktop-telegram-prompt {
    display: none;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 18px 44px -22px rgba(0, 0, 0, 0.7);
    animation: telegram-prompt-in 620ms var(--ease-out) 900ms both;
    transition: transform 240ms var(--ease-out), border-color 240ms ease, background-color 240ms ease;
  }

  .desktop-telegram-prompt:hover {
    transform: translateY(-3px);
    border-color: rgba(255, 255, 255, 0.24);
    background: rgba(255, 255, 255, 0.11);
  }

  .desktop-telegram-prompt:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.55);
    outline-offset: 3px;
  }

  .telegram-badge {
    background: linear-gradient(135deg, #2aabee 0%, #229ed9 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
  }

  /* A slow outward pulse — the one authored motion this element gets,
     reads as "this is alive/tappable" against the otherwise static
     stage, without competing with the entrance animation above. */
  .telegram-ring {
    background: radial-gradient(circle, rgba(42, 171, 238, 0.6) 0%, rgba(42, 171, 238, 0) 70%);
    animation: telegram-ring-pulse 2.8s ease-out infinite;
  }

  @keyframes telegram-prompt-in {
    from { opacity: 0; transform: translateY(16px) scale(0.92); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes telegram-ring-pulse {
    0% { opacity: 0.6; transform: scale(0.8); }
    70%, 100% { opacity: 0; transform: scale(1.7); }
  }

  /* Only once the letterbox has real backdrop to float in (see
     app.css's own --app-max-width breakpoint at 481px) — and even then,
     not until there's enough margin on either side of the 480px frame
     for this at its full width without crowding the frame's own edge. */
  @media (min-width: 760px) {
    .desktop-telegram-prompt {
      display: flex;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .desktop-telegram-prompt {
      animation: telegram-prompt-in 1ms both;
    }
    .telegram-ring {
      animation: none;
      opacity: 0.3;
    }
  }

  /* Telegram is a dedicated container for this app, never a stray
     browser tab — the whole reason this prompt exists in the first
     place (see app.css's own frame-exemption comment). Showing "open in
     Telegram" while already inside Telegram makes no sense. */
  :global(html.telegram-mini-app) .desktop-telegram-prompt {
    display: none !important;
  }
</style>
