<script lang="ts">
  import { formatEtb } from '$lib/utils/currency.js';
  import { Ticket as TicketIcon } from 'lucide-svelte';

  export let raffleTitle: string;
  export let ticketCode: string;
  export let ticketNumber: number;
  export let amount: number;
  export let purchasedAt: string;
  export let expiresAt: string | undefined;

  $: expired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
</script>

<div class="ticket-receipt-paper relative bg-[#fbf8f0] px-4 pb-5 pt-6 text-[#2b2b26]">
  <div class="flex items-center justify-center gap-1.5 text-center">
    <TicketIcon size={11} class="text-[#8a8578]" />
    <p class="text-[10px] font-black uppercase tracking-[0.22em]">YeneEta ticket</p>
  </div>

  <div class="ticket-receipt-rule my-3"></div>

  <p class="truncate text-center text-[10px] font-bold uppercase tracking-[0.03em] text-[#5a564a]">{raffleTitle}</p>
  <p class="mt-1 text-center font-mono text-lg font-black tracking-[0.02em]">{ticketCode}</p>
  <p class="mt-0.5 text-center text-[9px] text-[#8a8578]">Ticket No. {ticketNumber}</p>

  <div class="ticket-receipt-rule my-3"></div>

  <dl class="space-y-1.5 font-mono text-[10px]">
    <div class="flex justify-between"><dt class="text-[#8a8578]">PAID</dt><dd class="font-bold">{formatEtb(amount)} ETB</dd></div>
    <div class="flex justify-between"><dt class="text-[#8a8578]">ISSUED</dt><dd class="font-bold">{fmt(purchasedAt)}</dd></div>
    {#if expiresAt}
      <div class="flex justify-between">
        <dt class="text-[#8a8578]">{expired ? 'EXPIRED' : 'EXPIRES'}</dt>
        <dd class="font-bold {expired ? 'text-[#c74d4d]' : ''}">{fmt(expiresAt)}</dd>
      </div>
    {/if}
  </dl>

  <div class="ticket-receipt-rule my-3"></div>

  <p class="text-center text-[9px] font-black uppercase tracking-[0.12em] {expired ? 'text-[#8a8578]' : 'text-[#00a884]'}">
    {expired ? 'Draw closed' : '✓ Valid entry'}
  </p>
</div>

<style>
  /* Same "torn paper" edge trick as PaperReceipt.svelte, sized for a
     smaller inline card rather than the full-screen purchase moment. */
  .ticket-receipt-paper::before,
  .ticket-receipt-paper::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 7px;
    background-image:
      linear-gradient(135deg, #fbf8f0 50%, transparent 50%),
      linear-gradient(-135deg, #fbf8f0 50%, transparent 50%);
    background-size: 12px 14px;
    background-repeat: repeat-x;
  }
  .ticket-receipt-paper::before { top: -6px; background-position: bottom; }
  .ticket-receipt-paper::after { bottom: -6px; transform: scaleY(-1); background-position: bottom; }

  .ticket-receipt-rule {
    border-top: 1.5px dashed #d8d2c0;
  }
</style>
