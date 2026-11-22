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
      expect(formatInline('**State**', { links: false })).toBe('<strong>State</strong>');
      expect(formatInline('*leise* und ~~weg~~', { links: false })).toBe(
        '<em>leise</em> und <s>weg</s>',
      );
    });

    it('leaves a wikilink as the text it was typed as', () => {
      // In der Zelle faengt der Klick das Bearbeiten ab — ein Verweis waere
      // ein Versprechen, das niemand einloest.
      expect(formatInline('siehe [[Plan]]', { links: false })).toBe('siehe [[Plan]]');
      expect(formatInline('siehe [[Plan]]')).toContain('data-plan="Plan"');
    });

    it('escapes before it formats, here too', () => {
      expect(formatInline('<img src=x onerror=alert(1)> **fett**', { links: false })).toBe(
        '&lt;img src=x onerror=alert(1)&gt; <strong>fett</strong>',
      );
    });

    it('carries the option through a multi-line cell', () => {
      expect(formatBlock('**a**\n[[b]]', { links: false })).toBe('<strong>a</strong><br>[[b]]');
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

  describe('web links', () => {
    it('links a bare address and keeps its text as typed', () => {
      expect(formatInline('see https://x.com/a__b__c.')).toBe(
        'see <a class="plan-link" href="https://x.com/a__b__c" title="https://x.com/a__b__c" target="_blank" rel="noopener noreferrer">https://x.com/a__b__c</a>.',
      );
    });

    it('shows a markdown link by its label, also inside bold', () => {
      expect(formatInline('**[Spec](https://x.com/s?a=1&b=2)**')).toBe(
        '<strong><a class="plan-link" href="https://x.com/s?a=1&amp;b=2" title="https://x.com/s?a=1&amp;b=2" data-md="" target="_blank" rel="noopener noreferrer">Spec</a></strong>',
      );
    });

    it('never links other schemes, and not in table cells', () => {
      expect(formatInline('[x](javascript:alert(1))')).toBe('[x](javascript:alert(1))');
      expect(formatInline('https://x.com', { links: false })).toBe('https://x.com');
    });
  });
});
