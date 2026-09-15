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

  describe('wikiLinkTargets', () => {
    it('collects and trims every target', () => {
      expect(wikiLinkTargets('[[ One ]] and [[Two]]')).toEqual(['One', 'Two']);
    });

    it('returns nothing when there is no link', () => {
      expect(wikiLinkTargets('plain text')).toEqual([]);
    });
  });
});
