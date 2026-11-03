// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { isEditableTarget, reviewNavigationStep } from "./keyboard-navigation";

afterEach(() => {
  document.body.innerHTML = "";
});

function element(html: string, selector = "[data-target]"): Element {
  document.body.innerHTML = html;
  const found = document.querySelector(selector);
  if (!found) throw new Error("Missing fixture element");
  return found;
}

function key(
  keyName: string,
  target: EventTarget | null = document.body,
  modifiers: Partial<KeyboardEvent> = {},
) {
  return {
    key: keyName,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    defaultPrevented: false,
    target,
    ...modifiers,
  };
}

describe("review keyboard navigation", () => {
  it("maps only unmodified Left and Right arrows to a single ply step", () => {
    expect(reviewNavigationStep(key("ArrowLeft"))).toBe(-1);
    expect(reviewNavigationStep(key("ArrowRight"))).toBe(1);
    for (const other of ["ArrowUp", "ArrowDown", "Home", "End", "a", " "]) {
      expect(reviewNavigationStep(key(other))).toBeNull();
    }
    for (const modifier of ["altKey", "ctrlKey", "metaKey"] as const) {
      expect(
        reviewNavigationStep(
          key("ArrowRight", document.body, { [modifier]: true }),
        ),
      ).toBeNull();
    }
  });

  it("leaves an already-handled key alone", () => {
    expect(
      reviewNavigationStep(
        key("ArrowRight", document.body, { defaultPrevented: true }),
      ),
    ).toBeNull();
  });

  it.each([
    ['<input data-target type="text" />'],
    ['<input data-target type="search" />'],
    ['<input data-target type="range" />'],
    ["<textarea data-target></textarea>"],
    ["<select data-target><option>a</option></select>"],
    ['<div contenteditable="true"><span data-target>text</span></div>'],
    ['<div contenteditable="plaintext-only" data-target></div>'],
    ['<div contenteditable="" data-target></div>'],
    ['<div role="textbox" data-target></div>'],
  ])("suppresses shortcuts inside %s", (html) => {
    const target = element(html);
    expect(isEditableTarget(target)).toBe(true);
    expect(reviewNavigationStep(key("ArrowLeft", target))).toBeNull();
    expect(reviewNavigationStep(key("ArrowRight", target))).toBeNull();
  });

  it.each([
    ["<button data-target>Next</button>"],
    ['<div role="slider" tabindex="0" data-target></div>'],
    ['<div contenteditable="false" data-target></div>'],
    ["<a data-target href='#'>link</a>"],
  ])("keeps shortcuts active on non-editable %s", (html) => {
    const target = element(html);
    expect(isEditableTarget(target)).toBe(false);
    expect(reviewNavigationStep(key("ArrowRight", target))).toBe(1);
  });

  it("treats the window and a missing target as non-editable", () => {
    expect(isEditableTarget(window)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
