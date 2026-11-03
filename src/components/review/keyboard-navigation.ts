/**
 * Controls whose own keyboard behaviour must win over page-level shortcuts:
 * text entry, option pickers, and anything an author made editable.
 */
const EDITABLE_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="spinbutton"]',
].join(", ");

export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false;
  }
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target.closest(EDITABLE_SELECTOR) !== null;
}

/**
 * The ply offset a review-navigation key requests, or null when the event is
 * not a navigation shortcut or belongs to another control.
 */
export function reviewNavigationStep(
  event: Pick<
    KeyboardEvent,
    "key" | "altKey" | "ctrlKey" | "metaKey" | "defaultPrevented" | "target"
  >,
): -1 | 1 | null {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey)
    return null;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return null;
  if (isEditableTarget(event.target)) return null;
  return event.key === "ArrowLeft" ? -1 : 1;
}
