<script lang="ts">
  import '../../app.css';
</script>

<div class="relative min-h-dvh w-full overflow-hidden bg-gradient-to-br from-bg-start to-bg-end">
  <!-- Soft ambient light — three blurred color orbs drifting slowly behind
       the form. Replaces the old dotted world-map (too high-contrast,
       fought with the copy for attention); this stays quiet and out of
       the way while still giving the screen some depth. -->
  <div class="pointer-events-none absolute inset-0 overflow-hidden">
    <div class="orb orb-a absolute -left-20 -top-24 h-[300px] w-[300px] rounded-full bg-primary/40 blur-2xl"></div>
    <div class="orb orb-b absolute -right-16 top-[6%] h-[220px] w-[220px] rounded-full bg-coral-start/35 blur-2xl"></div>
    <div class="orb orb-c absolute -bottom-20 left-[8%] h-[300px] w-[300px] rounded-full bg-gold/30 blur-2xl"></div>
  </div>

  <!-- Foreground auth views (Login, Verify) -->
  <div class="relative z-10">
    <slot />
  </div>
</div>

<style>
  .orb {
    animation: orb-drift 14s var(--ease-in-out) infinite alternate;
  }

  .orb-b {
    animation-duration: 17s;
    animation-delay: -4s;
  }

  .orb-c {
    animation-duration: 20s;
    animation-delay: -9s;
  }

  @keyframes orb-drift {
    from {
      transform: translate(0, 0) scale(1);
    }
    to {
      transform: translate(18px, 22px) scale(1.08);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .orb {
      animation: none;
    }
  }
</style>
