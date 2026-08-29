<script lang="ts">
  /** Size in pixels (default 24px) */
  export let size: number = 24;
  /** Color of the spinner bars (default white) */
  export let color: string = '#ffffff';
</script>

<div
  class="ios-spinner"
  style="width: {size}px; height: {size}px;"
  role="status"
  aria-label="Loading"
>
  {#each Array(12) as _, i}
    <div
      class="ios-blade"
      style="
        background-color: {color};
        transform: rotate({i * 30}deg) translate(0, -140%);
        animation-delay: -{(12 - i) * (1 / 12)}s;
      "
    ></div>
  {/each}
</div>

<style>
  .ios-spinner {
    position: relative;
    display: inline-block;
    vertical-align: middle;
  }

  .ios-blade {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 8.5%;
    height: 28%;
    margin-left: -4.25%;
    margin-top: -14%;
    border-radius: 9999px;
    animation: ios-fade 1s linear infinite;
    opacity: 0.15;
    will-change: opacity;
  }

  @keyframes ios-fade {
    0% {
      opacity: 1;
    }
    100% {
      opacity: 0.15;
    }
  }
</style>
