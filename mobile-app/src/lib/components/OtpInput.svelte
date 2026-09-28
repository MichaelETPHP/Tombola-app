<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import { _ } from 'svelte-i18n';

  export let length = 6;
  export let value = '';
  export let disabled = false;

  const dispatch = createEventDispatcher<{ complete: string }>();

  let digits: string[] = Array(length).fill('');
  let boxes: HTMLInputElement[] = [];
  let dispatchedFor = '';

  function syncValue() {
    value = digits.join('');
    if (value.length === length && value !== dispatchedFor) {
      dispatchedFor = value;
      boxes.forEach((box) => box?.blur());
      dispatch('complete', value);
    }
  }

  async function onInput(i: number, e: Event) {
    const target = e.target as HTMLInputElement;
    const raw = target.value.replace(/\D/g, '');

    if (raw.length > 1) {
      // Platform SMS-autofill suggestion — always lands in whichever box
      // has focus (normally box 0, the only one with room for it; see
      // maxlength below) via a plain `input` event, not `paste`, so the
      // explicit paste handler below doesn't see it. Fill from *this* box
      // forward.
      const start = raw.length >= length ? 0 : i;
      const chars = raw.slice(0, length - start).split('');
      chars.forEach((c, offset) => {
        digits[start + offset] = c;
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

  // A manual copy-paste from the SMS app can land on *any* box, not just
  // the first — every box past index 0 caps `maxlength` at 1 (see below),
  // which would otherwise silently truncate a pasted 6-digit code down to
  // its single leftover character before `onInput` ever saw the rest.
  // Reading the clipboard directly here, before that truncation happens,
  // fills the whole code from the start regardless of which box the paste
  // landed on — the same forgiving behavior banking/checkout OTP inputs
  // give you.
  async function onPaste(e: ClipboardEvent) {
    const raw = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '');
    if (!raw) return;
    e.preventDefault();

    digits = Array(length).fill('');
    const chars = raw.slice(0, length).split('');
    chars.forEach((c, index) => {
      digits[index] = c;
    });
    digits = digits;
    const nextEmpty = digits.findIndex((d) => !d);
    await tick();
    (boxes[nextEmpty === -1 ? length - 1 : nextEmpty] ?? boxes[length - 1])?.focus();
    syncValue();
  }

  function onKeydown(i: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      digits[i - 1] = '';
      digits = digits;
      boxes[i - 1]?.focus();
      syncValue();
    }
  }

  // Keep programmatic values (the server-authorized demo code and parent
  // resets) visible without focusing a box or opening the mobile keyboard.
  $: if (value !== digits.join('')) {
    const normalized = value.replace(/\D/g, '').slice(0, length);
    digits = Array.from({ length }, (_, index) => normalized[index] ?? '');
    dispatchedFor = normalized.length === length ? normalized : '';
  }
</script>

<div class="flex justify-center gap-2.5">
  {#each digits as digit, i (i)}
    <input
      bind:this={boxes[i]}
      value={digit}
      on:input={(e) => onInput(i, e)}
      on:keydown={(e) => onKeydown(i, e)}
      on:paste={onPaste}
      type="text"
      inputmode="numeric"
      enterkeyhint={i === length - 1 ? 'done' : 'next'}
      maxlength={i === 0 ? length : 1}
      autocomplete={i === 0 ? 'one-time-code' : 'off'}
      aria-label={$_('otpInput.digitAria', { values: { n: i + 1, length } })}
      {disabled}
      class="h-14 w-11 rounded-button bg-bg-start text-center font-display text-2xl font-semibold text-ink outline-none ring-2 ring-transparent transition-[box-shadow] duration-150 ease-[var(--ease-out)] focus:ring-primary disabled:opacity-60"
    />
  {/each}
</div>
