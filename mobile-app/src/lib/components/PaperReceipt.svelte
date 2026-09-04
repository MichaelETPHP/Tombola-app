<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { formatEtb } from '$lib/utils/currency.js';
  import { hapticLight, hapticMedium } from '$lib/native/haptics.js';
  import { Ticket, X } from 'lucide-svelte';

  export let raffleTitle: string;
  export let ticketCodes: string[];
  export let amount: number;
  export let gateway: string;
  export let receiptId: string;
  export let createdAt: string;
  export let onDismiss: () => void;

  const DURATION_MS = 5000;
  let timer: ReturnType<typeof setTimeout>;
  let barPulled = false;

  const printedAt = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(createdAt));

  function dismiss() {
    clearTimeout(timer);
    hapticLight();
    onDismiss();
  }

  onMount(() => {
    hapticMedium();
    // Two rAFs: the first commits the 0%-progress starting state to the
    // DOM, the second is where the browser actually paints it — starting
    // the CSS transition any earlier and the browser coalesces both
    // states into one frame, so the bar would just appear already full.
    requestAnimationFrame(() => requestAnimationFrame(() => { barPulled = true; }));
    timer = setTimeout(dismiss, DURATION_MS);
  });
  onDestroy(() => clearTimeout(timer));
</script>

<div class="receipt-overlay fixed inset-0 z-[60] flex flex-col items-center justify-center px-6" role="dialog" aria-modal="true" aria-label="Purchase receipt">
  <button
    type="button"
    class="pressable absolute right-5 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm"
    style="top: max(20px, var(--safe-top));"
    aria-label="Skip"
    on:click={dismiss}
  >
    <X size={18} />
  </button>

  <div class="receipt-print w-full max-w-[300px]">
    <div class="receipt-paper relative bg-[#fbf8f0] px-5 pb-6 pt-7 text-[#2b2b26] shadow-[0_30px_60px_rgba(0,0,0,0.35)]">
      <div class="text-center">
        <p class="text-[13px] font-black uppercase tracking-[0.28em]">YeneEta</p>
        <p class="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#8a8578]">Official purchase receipt</p>
      </div>

      <div class="receipt-rule my-4"></div>

      <p class="truncate text-[11px] font-bold uppercase tracking-[0.04em]">{raffleTitle}</p>

      <div class="mt-3 space-y-1.5">
        {#each ticketCodes as code, i (code)}
          <div class="flex items-center justify-between font-mono text-[11px]" style="animation-delay: {180 + i * 70}ms" class:receipt-line={true}>
            <span class="flex items-center gap-1.5 text-[#5a564a]"><Ticket size={11} /> TICKET</span>
            <span class="font-bold tracking-[0.03em]">{code}</span>
          </div>
        {/each}
      </div>

      <div class="receipt-rule my-4"></div>

      <dl class="space-y-1.5 font-mono text-[11px]">
        <div class="flex justify-between"><dt class="text-[#8a8578]">QTY</dt><dd class="font-bold">{ticketCodes.length}</dd></div>
        <div class="flex justify-between"><dt class="text-[#8a8578]">PAID</dt><dd class="font-bold">{formatEtb(amount)} ETB</dd></div>
        <div class="flex justify-between"><dt class="text-[#8a8578]">METHOD</dt><dd class="font-bold uppercase">{gateway}</dd></div>
        <div class="flex justify-between"><dt class="text-[#8a8578]">TIME</dt><dd class="font-bold">{printedAt}</dd></div>
        <div class="flex justify-between gap-3"><dt class="shrink-0 text-[#8a8578]">REF</dt><dd class="truncate font-bold">{receiptId}</dd></div>
      </dl>

      <div class="receipt-rule my-4"></div>

      <p class="text-center text-[10px] font-black uppercase tracking-[0.14em] text-[#00a884]">✓ Confirmed — good luck</p>
    </div>
  </div>

  <div class="mt-7 flex w-full max-w-[300px] flex-col items-center gap-2.5">
    <button type="button" class="pressable min-h-11 px-3 text-[11px] font-bold text-white/70" on:click={dismiss}>Skip · Continue now</button>
    <div class="h-[3px] w-full overflow-hidden rounded-full bg-white/15">
      <div class="h-full rounded-full bg-white transition-[width] ease-linear" class:receipt-bar-pulled={barPulled} style="width: 100%; transition-duration: {DURATION_MS}ms;"></div>
    </div>
  </div>
</div>

<style>
  .receipt-overlay {
    background: radial-gradient(120% 100% at 50% 0%, #1a1d29 0%, #0f1117 100%);
    animation: overlay-in 220ms var(--ease-out) both;
  }

  /* The zigzag "torn paper" edge — two thin repeating-triangle strips
     stacked at the top and bottom of the receipt, standard CSS trick for
     a perforated/torn thermal-paper look. */
  .receipt-paper::before,
  .receipt-paper::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 9px;
    background-image:
      linear-gradient(135deg, #fbf8f0 50%, transparent 50%),
      linear-gradient(-135deg, #fbf8f0 50%, transparent 50%);
    background-size: 14px 18px;
    background-repeat: repeat-x;
  }
  .receipt-paper::before { top: -8px; background-position: bottom; }
  .receipt-paper::after { bottom: -8px; transform: scaleY(-1); background-position: bottom; }

  .receipt-rule {
    border-top: 1.5px dashed #d8d2c0;
  }

  .receipt-line {
    animation: line-in 260ms var(--ease-out) both;
  }

  /* The receipt "feeds out" top-to-bottom like it's coming off a printer,
     with a faint downward settle rather than just fading in — this only
     ever plays once, right after a real purchase, so the extra motion is
     earned rather than something a user sits through repeatedly. */
  .receipt-print {
    animation: print-out 620ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .receipt-bar-pulled {
    width: 0% !important;
  }

  @keyframes overlay-in {
    from { opacity: 0; }
  }
  @keyframes print-out {
    /* End state's clip-path extends 10px past the box on top/bottom —
       exactly enough to stop clipping .receipt-paper's zigzag edges
       (offset -8px), which clip-path would otherwise cut off forever,
       not just mid-animation, since it clips this element's entire
       subtree at its own box edges. */
    from { clip-path: inset(0 0 100% 0); transform: translateY(-10px); }
    to { clip-path: inset(-10px 0 -10px 0); transform: translateY(0); }
  }
  @keyframes line-in {
    from { opacity: 0; transform: translateX(-4px); }
    to { opacity: 1; transform: translateX(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .receipt-overlay, .receipt-print, .receipt-line { animation: none; }
    .transition-\[width\] { transition: none; }
  }
</style>
