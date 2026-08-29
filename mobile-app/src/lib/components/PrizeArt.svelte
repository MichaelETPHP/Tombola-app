<script lang="ts">
  import { Smartphone, Car, Gem, Home as HomeIcon, Banknote, Gift } from 'lucide-svelte';

  export let title: string;
  export let prizeName = '';
  /** sm = card thumbnail, lg = hero banner/detail */
  export let size: 'sm' | 'lg' = 'sm';

  type Category = {
    key: string;
    match: RegExp;
    icon: typeof Gift;
    gradient: string;
    glow: string;
    pattern: 'dots' | 'lines' | 'sparkle' | 'grid';
  };

  // No product photography exists for seeded prizes yet — rather than a bare
  // "missing image" box, infer a category from the prize copy and render a
  // bespoke spotlight treatment per category. Keeps every card feeling
  // designed instead of empty.
  const categories: Category[] = [
    {
      key: 'tech',
      match: /iphone|phone|samsung|electronics?|laptop|tablet|\btv\b/i,
      icon: Smartphone,
      gradient: 'linear-gradient(135deg, #14171f 0%, #242b40 100%)',
      glow: '#00d3a0',
      pattern: 'dots',
    },
    {
      key: 'vehicle',
      match: /\bcar\b|vehicle|yaris|toyota|honda|motor|sedan/i,
      icon: Car,
      gradient: 'linear-gradient(135deg, #1a2a21 0%, #2d3f33 100%)',
      glow: '#f5a623',
      pattern: 'lines',
    },
    {
      key: 'jewelry',
      match: /\bgold\b|jewel|diamond|necklace|\bring\b|bracelet|earring/i,
      icon: Gem,
      gradient: 'linear-gradient(135deg, #241708 0%, #100b06 100%)',
      glow: '#f5a623',
      pattern: 'sparkle',
    },
    {
      key: 'appliance',
      match: /appliance|fridge|refrigerator|washing|microwave|oven|home\b/i,
      icon: HomeIcon,
      gradient: 'linear-gradient(135deg, #1b2230 0%, #10141d 100%)',
      glow: '#00d3a0',
      pattern: 'grid',
    },
    {
      key: 'cash',
      match: /\bcash\b|\bmoney\b|birr prize/i,
      icon: Banknote,
      gradient: 'linear-gradient(135deg, #0a2c22 0%, #051510 100%)',
      glow: '#00d3a0',
      pattern: 'lines',
    },
  ];

  const fallback: Category = {
    key: 'gift',
    match: /.*/,
    icon: Gift,
    gradient: 'linear-gradient(135deg, #1c2733 0%, #0f151d 100%)',
    glow: '#ff8674',
    pattern: 'dots',
  };

  $: haystack = `${title} ${prizeName}`;
  $: category = categories.find((c) => c.match.test(haystack)) ?? fallback;
  $: iconSize = size === 'lg' ? 60 : 30;
</script>

<div class="prize-art prize-art--{category.pattern}" style:background={category.gradient}>
  <div class="prize-art__shine"></div>
  <svelte:component
    this={category.icon}
    size={iconSize}
    class="prize-art__icon"
    style="color: {category.glow}"
  />
</div>

<style>
  .prize-art {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .prize-art :global(.prize-art__icon) {
    position: relative;
    z-index: 2;
    filter: drop-shadow(0 0 20px currentColor);
  }

  .prize-art__shine {
    position: absolute;
    inset: -60%;
    z-index: 1;
    background: linear-gradient(115deg, transparent 42%, rgba(255, 255, 255, 0.16) 50%, transparent 58%);
  }

  .prize-art--dots::before,
  .prize-art--grid::before,
  .prize-art--lines::before,
  .prize-art--sparkle::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    opacity: 0.5;
  }

  .prize-art--dots::before {
    background-image: radial-gradient(rgba(255, 255, 255, 0.14) 1px, transparent 1.5px);
    background-size: 16px 16px;
  }

  .prize-art--grid::before {
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
    background-size: 22px 22px;
  }

  .prize-art--lines::before {
    background-image: repeating-linear-gradient(
      -35deg,
      rgba(255, 255, 255, 0.08) 0,
      rgba(255, 255, 255, 0.08) 2px,
      transparent 2px,
      transparent 14px
    );
  }

  .prize-art--sparkle::before {
    background-image:
      radial-gradient(rgba(255, 255, 255, 0.5) 1px, transparent 1.5px),
      radial-gradient(rgba(255, 255, 255, 0.3) 1px, transparent 1.5px);
    background-size: 40px 40px, 26px 26px;
    background-position: 0 0, 13px 18px;
  }
</style>
