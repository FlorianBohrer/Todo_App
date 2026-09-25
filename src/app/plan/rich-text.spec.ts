import {
  ANCHOR,
  caretIn,
  justClosed,
  positionAt,
  renderRich,
  scanRich,
} from './rich-text';

/** Baut ein Element mit dem gegebenen HTML — so sieht der Editor von innen aus. */
function editor(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

describe('scanRich', () => {
  it('reads plain text', () => {
    expect(scanRich(editor('hello')).md).toBe('hello');
  });

  it('turns the formatting back into markdown', () => {
    expect(scanRich(editor('a <strong>b</strong> c')).md).toBe('a **b** c');
    expect(scanRich(editor('<em>x</em>')).md).toBe('*x*');
    expect(scanRich(editor('<u>x</u>')).md).toBe('__x__');
    expect(scanRich(editor('<s>x</s>')).md).toBe('~~x~~');
    expect(scanRich(editor('<code>x</code>')).md).toBe('`x`');
  });

  it('accepts the tags the browser produces for bold and italic', () => {
    // document.execCommand liefert je nach Browser <b>/<i> statt <strong>/<em>.
    expect(scanRich(editor('<b>x</b>')).md).toBe('**x**');
    expect(scanRich(editor('<i>x</i>')).md).toBe('*x*');
    expect(scanRich(editor('<strike>x</strike>')).md).toBe('~~x~~');
  });

  it('nests', () => {
    expect(scanRich(editor('<strong><em>x</em></strong>')).md).toBe('***x***');
  });

  it('reads a wikilink from its text, not from the attribute', () => {
    // Sonst ginge jede Aenderung im Link beim Speichern verloren: angezeigt
    // wuerde der neue Text, gespeichert das alte Ziel.
    const el = editor('<span data-plan="Alt">Neu</span>');
    expect(scanRich(el).md).toBe('[[Neu]]');
  });

  it('drops an empty piece of formatting instead of writing ****', () => {
    expect(scanRich(editor('a<strong></strong>b')).md).toBe('ab');
  });

  it('keeps line breaks but not the one the browser adds at the end', () => {
    expect(scanRich(editor('a<br>b')).md).toBe('a\nb');
    // Ein leeres contenteditable enthaelt in Chrome genau ein <br>.
    expect(scanRich(editor('<br>')).md).toBe('');
    expect(scanRich(editor('a<br>')).md).toBe('a');
  });

  it('reads a non-breaking space as a normal one', () => {
    expect(scanRich(editor('a b')).md).toBe('a b');
  });
});

describe('the caret anchor', () => {
  // Gemessen in echtem Chromium (nicht in jsdom, das kennt weder execCommand
  // noch eine Auswahl, die sich bewegt): steht der Cursor direkt hinter einem
  // <strong>, schreibt der Browser den naechsten Buchstaben HINEIN — auch
  // wenn dort ein gewoehnlicher Textknoten steht. Nur ein eigener Knoten mit
  // einem Zeichen ohne Breite haelt den Cursor draussen.
  it('never reaches the markdown', () => {
    expect(scanRich(editor(`<strong>bold</strong>${ANCHOR}`)).md).toBe('**bold**');
    expect(scanRich(editor(`a${ANCHOR}b`)).md).toBe('ab');
  });

  it('does not shift the caret', () => {
    const el = editor(`<strong>b</strong>${ANCHOR}x`);
    const scan = scanRich(el);
    const tail = el.lastChild as Text; // „​x"
    // Cursor hinter dem x: im Markdown ist das hinter „**b**x", also 6.
    expect(caretIn(scan, tail, 2)).toBe(6);
    // Und hinter dem Anker, vor dem x: 5.
    expect(caretIn(scan, tail, 1)).toBe(5);
  });

  it('is skipped when the caret goes back to that spot', () => {
    const el = editor(`<strong>b</strong>${ANCHOR}x`);
    const scan = scanRich(el);
    // Position 5 ist im gelesenen Text vor dem x — im DOM hinter dem Anker.
    expect(positionAt(scan, 5)).toEqual({ node: el.lastChild, offset: 1 });
  });
});

describe('caretIn', () => {
  it('counts the markers, not just the letters', () => {
    // Der Cursor steht hinter dem „b" in <strong>ab</strong> — im Markdown ist
    // das Position 4, weil die beiden Sternchen davor mitzaehlen.
    const el = editor('<strong>ab</strong>');
    const scan = scanRich(el);
    const text = el.querySelector('strong')!.firstChild!;
    expect(caretIn(scan, text, 2)).toBe(4);
  });

  it('finds the caret between two nodes', () => {
    const el = editor('<strong>a</strong>b');
    const scan = scanRich(el);
    expect(caretIn(scan, el, 1)).toBe(5); // hinter **a**
  });

  it('is -1 for a node that is not in the editor', () => {
    const scan = scanRich(editor('a'));
    expect(caretIn(scan, document.createElement('div'), 0)).toBe(-1);
    expect(caretIn(scan, null, 0)).toBe(-1);
  });
});

describe('positionAt', () => {
  it('finds the node for a markdown position', () => {
    const el = editor('ab<strong>cd</strong>');
    const scan = scanRich(el);

    const inPlain = positionAt(scan, 1);
    expect(inPlain!.node.nodeValue).toBe('ab');
    expect(inPlain!.offset).toBe(1);

    // Position 5 = „ab" + „**" + „c"
    const inBold = positionAt(scan, 5);
    expect(inBold!.node.nodeValue).toBe('cd');
    expect(inBold!.offset).toBe(1);
  });

  it('round-trips with caretIn', () => {
    const el = editor('a <em>b</em> c');
    const scan = scanRich(el);
    for (const at of [0, 1, 2, 3, 4, 5, 7]) {
      const pos = positionAt(scan, at);
      expect(pos).not.toBeNull();
      expect(caretIn(scan, pos!.node, pos!.offset)).toBe(at);
    }
  });

  it('answers for an empty editor', () => {
    const el = editor('');
    expect(positionAt(scanRich(el), 0)).toEqual({ node: el, offset: 0 });
  });
});

describe('justClosed', () => {
  it('fires on the keystroke that closes the markup', () => {
    expect(justClosed('**bold**')).toBe(true);
    expect(justClosed('some *italic*')).toBe(true);
    expect(justClosed('__under__')).toBe(true);
    expect(justClosed('~~gone~~')).toBe(true);
    expect(justClosed('`code`')).toBe(true);
    expect(justClosed('***both***')).toBe(true);
    expect(justClosed('[[Plan]]')).toBe(true);
  });

  it('stays quiet while the markup is still open', () => {
    // Waehrend man tippt, soll dastehen, was man tippt.
    expect(justClosed('**bold')).toBe(false);
    expect(justClosed('**bold*')).toBe(false);
    expect(justClosed('*')).toBe(false);
    expect(justClosed('a * b')).toBe(false);
    expect(justClosed('[[Plan]')).toBe(false);
  });

  it('only looks at the end — the cursor is what matters', () => {
    expect(justClosed('**done** and more')).toBe(false);
  });

  it('does not read the second star of a bold pair as an italic', () => {
    expect(justClosed('x **b**')).toBe(true);
    expect(justClosed('2 * 3 * 4')).toBe(false);
  });
});

describe('renderRich', () => {
  it('renders what scanRich reads, and back again', () => {
    const md = 'a **b** and *c* and `d`';
    const back = scanRich(editor(renderRich(md))).md;
    expect(back).toBe(md);
  });

  it('round-trips a wikilink', () => {
    const md = 'see [[Other Plan]] there';
    expect(scanRich(editor(renderRich(md))).md).toBe(md);
  });

  it('round-trips bold italic', () => {
    expect(scanRich(editor(renderRich('***x***')).valueOf() as HTMLElement).md).toBe('***x***');
  });

  it('escapes what the user typed', () => {
    expect(renderRich('<script>')).not.toContain('<script>');
  });
});
