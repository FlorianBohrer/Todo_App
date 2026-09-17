import { isTypingTarget } from './keyboard';

function el(tag: string): HTMLElement {
  return document.createElement(tag);
}

describe('isTypingTarget', () => {
  it('treats form fields as typing', () => {
    expect(isTypingTarget(el('input'))).toBe(true);
    expect(isTypingTarget(el('textarea'))).toBe(true);
    expect(isTypingTarget(el('select'))).toBe(true);
  });

  it('treats a contenteditable element as typing', () => {
    // So steht es im Markup. Die IDL-Eigenschaft contentEditable wird nicht in
    // jeder DOM-Implementierung aufs Attribut gespiegelt — deshalb prüft der
    // Code beides, und der Test setzt den Fall, den es wirklich gibt.
    const node = el('div');
    node.setAttribute('contenteditable', 'true');
    expect(isTypingTarget(node)).toBe(true);

    const bare = el('div');
    bare.setAttribute('contenteditable', '');
    expect(isTypingTarget(bare)).toBe(true);
  });

  it('lets a shortcut through on an explicitly non-editable element', () => {
    const node = el('div');
    node.setAttribute('contenteditable', 'false');
    expect(isTypingTarget(node)).toBe(false);
  });

  it('lets a shortcut through on ordinary elements', () => {
    expect(isTypingTarget(el('div'))).toBe(false);
    expect(isTypingTarget(el('button'))).toBe(false);
    expect(isTypingTarget(el('body'))).toBe(false);
  });

  it('survives a missing or non-element target', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });
});
