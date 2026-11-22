import { formatInline, formatBlock, wikiLinkTargets } from './inline-format';

describe('inline-format', () => {
  describe('escaping', () => {
    it('escapes HTML so user text cannot become markup', () => {
      expect(formatInline('<script>alert(1)</script>')).toBe(
        '&lt;script&gt;alert(1)&lt;/script&gt;',
      );
    });

    it('escapes quotes and ampersands', () => {
      expect(formatInline(`a & "b" 'c'`)).toBe('a &amp; &quot;b&quot; &#39;c&#39;');
    });

    it('keeps markup literal inside code spans', () => {
      expect(formatInline('`<b>**x**</b>`')).toBe(
        '<code class="plan-code">&lt;b&gt;**x**&lt;/b&gt;</code>',
      );
    });
  });

  describe('formatting', () => {
    it('renders bold, italic and strikethrough', () => {
      expect(formatInline('**b**')).toBe('<strong>b</strong>');
      expect(formatInline('*i*')).toBe('<em>i</em>');
      expect(formatInline('~~s~~')).toBe('<s>s</s>');
    });

    it('does not read bold as italic', () => {
      expect(formatInline('**b**')).not.toContain('<em>');
    });

    it('renders a wikilink with its target in a data attribute', () => {
      const out = formatInline('see [[DB Model]] please');
      expect(out).toContain('data-plan="DB Model"');
      expect(out).toContain('>DB Model<');
    });

    it('keeps line breaks in multi-line text', () => {
      expect(formatBlock('a\nb')).toBe('a<br>b');
    });

    it('returns an empty string for empty input', () => {
      expect(formatInline('')).toBe('');
    });
  });

  describe('ohne Wikilinks (Tabellenzellen)', () => {
    it('formats the same as everywhere else', () => {
      // Genau der Fall aus der Tabelle: „**State**" war roher Text.
      expect(formatInline('**State**', { wikiLinks: false })).toBe('<strong>State</strong>');
      expect(formatInline('*leise* und ~~weg~~', { wikiLinks: false })).toBe(
        '<em>leise</em> und <s>weg</s>',
      );
    });

    it('leaves a wikilink as the text it was typed as', () => {
      // In der Zelle faengt der Klick das Bearbeiten ab — ein Verweis waere
      // ein Versprechen, das niemand einloest.
      expect(formatInline('siehe [[Plan]]', { wikiLinks: false })).toBe('siehe [[Plan]]');
      expect(formatInline('siehe [[Plan]]')).toContain('data-plan="Plan"');
    });

    it('escapes before it formats, here too', () => {
      expect(formatInline('<img src=x onerror=alert(1)> **fett**', { wikiLinks: false })).toBe(
        '&lt;img src=x onerror=alert(1)&gt; <strong>fett</strong>',
      );
    });

    it('carries the option through a multi-line cell', () => {
      expect(formatBlock('**a**\n[[b]]', { wikiLinks: false })).toBe('<strong>a</strong><br>[[b]]');
    });
  });

  describe('links', () => {
    it('renders a bare address whole, in parts the reader can hide', () => {
      const out = formatInline('PR https://www.github.com/a/b/pull/52?x=1 now');
      expect(out).toBe(
        'PR <a class="plan-url" href="https://www.github.com/a/b/pull/52?x=1" title="https://www.github.com/a/b/pull/52?x=1" target="_blank" rel="noopener noreferrer">' +
          '<span class="plan-url__hide">https:/<wbr>/<wbr>www.</span>github.com<span class="plan-url__mid">/<wbr>a/<wbr>b</span>' +
          '<span class="plan-url__tail">/<wbr>pull/<wbr>52</span><span class="plan-url__hide">?x=1</span></a> now',
      );
    });

    it('shows a markdown link as its label and keeps the address as typed', () => {
      const out = formatInline('[Offer](www.shop.de/o)');
      expect(out).toContain('href="https://www.shop.de/o"');
      expect(out).toContain('data-href="www.shop.de/o"');
      expect(out).toContain('>Offer</a>');
    });

    it('does not read markup inside an address', () => {
      const out = formatInline('https://x.de/__a__/*b*');
      expect(out).not.toContain('<u>');
      expect(out).not.toContain('<em>');
    });

    it('formats around a link', () => {
      expect(formatInline('**see https://x.de**')).toMatch(/^<strong>see <a class="plan-url"[^>]*><span class="plan-url__hide">https:\/<wbr>\/<\/span>x\.de<\/a><\/strong>$/);
    });

    it('escapes the address', () => {
      const out = formatInline('https://x.de/?q="a"<b>');
      expect(out).not.toContain('"a"');
      expect(out).not.toContain('<b>');
    });

    it('leaves an address inside a wikilink to the wikilink', () => {
      expect(formatInline('[[https://x.de]]')).not.toContain('plan-url');
    });

    it('never links another scheme', () => {
      expect(formatInline('[x](javascript:alert(1))')).not.toContain('<a');
    });
  });

  describe('wikiLinkTargets', () => {
    it('collects and trims every target', () => {
      expect(wikiLinkTargets('[[ One ]] and [[Two]]')).toEqual(['One', 'Two']);
    });

    it('returns nothing when there is no link', () => {
      expect(wikiLinkTargets('plain text')).toEqual([]);
    });
  });
});
