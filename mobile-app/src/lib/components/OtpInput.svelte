<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte';

  export let length = 6;
  export let value = '';
  export let disabled = false;

  const dispatch = createEventDispatcher<{ complete: string }>();

  let digits: string[] = Array(length).fill('');
  let boxes: HTMLInputElement[] = [];
  let dispatchedFor = '';

  onMount(() => {
    boxes[0]?.focus();
  });

  function syncValue() {
    value = digits.join('');
    if (value.length === length && value !== dispatchedFor) {
      dispatchedFor = value;
      dispatch('complete', value);
    }
  }

  async function onInput(i: number, e: Event) {
    const target = e.target as HTMLInputElement;
    const raw = target.value.replace(/\D/g, '');

    if (raw.length > 1) {
      // Pasted or autofilled — distribute across the remaining boxes.
      const chars = raw.slice(0, length - i).split('');
      chars.forEach((c, offset) => {
        digits[i + offset] = c;
      });
      digits = digits;
      const nextEmpty = digits.findIndex((d) => !d);
      await tick();
      (boxes[nextEmpty === -1 ? length - 1 : nextEmpty] ?? boxes[length - 1])?.focus();
      syncValue();
      return;
    }

    digits[i] = raw;
    digits = digits;
    syncValue();

    if (raw && i < length - 1) {
      boxes[i + 1]?.focus();
    }
  }

  function onKeydown(i: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      digits[i - 1] = '';
      digits = digits;
      boxes[i - 1]?.focus();
      syncValue();
    }
  }

  // Reset the boxes if the parent clears `value` (e.g. after a failed attempt).
  $: if (value === '' && digits.some((d) => d)) {
    digits = Array(length).fill('');
    dispatchedFor = '';
  }
</script>

<div class="flex justify-center gap-2.5">
  {#each digits as digit, i (i)}
    <input
      bind:this={boxes[i]}
      value={digit}
      on:input={(e) => onInput(i, e)}
      on:keydown={(e) => onKeydown(i, e)}
      type="text"
      inputmode="numeric"
      maxlength={i === 0 ? length : 1}
      autocomplete={i === 0 ? 'one-time-code' : 'off'}
      {disabled}
      class="h-14 w-11 rounded-button bg-bg-start text-center font-display text-2xl font-semibold text-ink outline-none ring-2 ring-transparent transition-[box-shadow] duration-150 ease-[var(--ease-out)] focus:ring-primary disabled:opacity-60"
    />
  {/each}
</div>
