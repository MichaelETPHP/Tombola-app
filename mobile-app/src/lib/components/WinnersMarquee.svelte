<script lang="ts">
  import { Trophy, Ticket, Sparkles, CheckCircle2 } from 'lucide-svelte';

  interface Entry {
    name: string;
    detail: string;
    prize: string;
    avatar?: string;
    type: 'win' | 'purchase' | 'join';
    color: 'primary' | 'coral' | 'gold' | 'pink' | 'blue';
    time: string;
  }

  const entries: Entry[] = [
    {
      name: 'Selamawit T.',
      detail: 'Claimed prize in Addis Ababa',
      prize: 'iPhone 16 Pro Max',
      avatar: '/images/winners/selamawit.jpg',
      type: 'win',
      color: 'primary',
      time: '1h ago',
    },
    {
      name: 'Abel K.',
      detail: 'Bought 3 tickets',
      prize: 'Toyota Yaris 2024',
      avatar: '/images/winners/abel.jpg',
      type: 'purchase',
      color: 'blue',
      time: '2h ago',
    },
    {
      name: 'Marta G.',
      detail: 'Grand prize winner',
      prize: '21K Gold Jewelry Set',
      avatar: '/images/winners/marta.jpg',
      type: 'win',
      color: 'gold',
      time: '4h ago',
    },
    {
      name: 'Dawit M.',
      detail: 'Active raffle participant',
      prize: 'MacBook Pro M3',
      avatar: '/images/winners/dawit.jpg',
      type: 'purchase',
      color: 'coral',
      time: '5h ago',
    },
    {
      name: 'Hana S.',
      detail: 'Instant cash payout',
      prize: '25,000 ETB Cash',
      avatar: '/images/winners/hana.jpg',
      type: 'win',
      color: 'gold',
      time: '6h ago',
    },
    {
      name: 'Yonas B.',
      detail: 'Bought 5 tickets',
      prize: 'iPhone 16 Pro Max',
      avatar: '/images/winners/yonas.webp',
      type: 'purchase',
      color: 'primary',
      time: '8h ago',
    },
    {
      name: 'Ruth A.',
      detail: 'Joined YeneEta community',
      prize: 'Welcome Bonus',
      avatar: '/images/winners/ruth.webp',
      type: 'join',
      color: 'pink',
      time: '12h ago',
    },
    {
      name: 'Nathnael W.',
      detail: 'Bought 5 tickets',
      prize: 'Toyota Yaris 2024',
      avatar: '/images/winners/nathnael.webp',
      type: 'purchase',
      color: 'blue',
      time: '1d ago',
    },
  ];

  const colorClasses: Record<Entry['color'], string> = {
    primary: 'bg-primary/15 text-primary-dark',
    coral: 'bg-[#ffe6e3] text-coral-start',
    gold: 'bg-gold-bg text-gold',
    pink: 'bg-pink-bg text-pink',
    blue: 'bg-blue-bg text-blue',
  };

  function initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join('');
  }
</script>

<div class="relative h-60 touch-pan-y overflow-hidden rounded-card border border-white/70 bg-card shadow-card-light">
  <div class="marquee-track flex flex-col">
    {#each [...entries, ...entries] as entry, i (i)}
      <div class="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-bg/50">
        <div class="flex min-w-0 items-center gap-3">
          <!-- Real Photo Avatar with Fallback Initials -->
          <div class="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-white shadow-sm">
            <span class={`absolute inset-0 flex items-center justify-center text-[11px] font-extrabold ${colorClasses[entry.color]}`}>
              {initials(entry.name)}
            </span>
            {#if entry.avatar}
              <img
                src={entry.avatar}
                alt={entry.name}
                class="absolute inset-0 z-[1] h-full w-full object-cover"
                loading="lazy"
                on:error={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            {/if}
            
            {#if entry.type === 'win'}
              <span class="absolute -bottom-0.5 -right-0.5 z-[2] flex h-4 w-4 items-center justify-center rounded-full bg-gold text-white shadow-xs">
                <Trophy size={9} class="stroke-[2.5]" />
              </span>
            {/if}
          </div>

          <!-- Winner / Participant Details -->
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <p class="truncate text-[13px] font-bold text-ink">{entry.name}</p>
              {#if entry.type === 'win'}
                <span class="inline-flex items-center gap-0.5 rounded-full bg-gold/15 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-gold">
                  Winner
                </span>
              {/if}
            </div>
            <p class="truncate text-[11px] font-medium text-muted">
              {entry.detail} · <span class="font-semibold text-ink/80">{entry.prize}</span>
            </p>
          </div>
        </div>

        <!-- Timestamp -->
        <span class="shrink-0 text-[10px] font-semibold text-muted/80">{entry.time}</span>
      </div>
    {/each}
  </div>

  <!-- Fade Gradients -->
  <div class="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-card via-card/80 to-transparent"></div>
  <div class="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card via-card/80 to-transparent"></div>
</div>

<style>
  .marquee-track {
    animation: marquee-up 22s linear infinite;
  }

  .marquee-track:hover {
    animation-play-state: paused;
  }

  @keyframes marquee-up {
    from {
      transform: translateY(0);
    }
    to {
      transform: translateY(-50%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .marquee-track {
      animation: none;
    }
  }
</style>
