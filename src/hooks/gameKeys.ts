/** Native editing/shortcuts own these events. Movement may repeat; actions may not. */
export function ignoresGameKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return true;
  const target = event.target;
  return target instanceof HTMLElement && (target.isContentEditable ||
    Boolean(target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])')));
}
