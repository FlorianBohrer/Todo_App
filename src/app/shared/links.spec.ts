import {
  findLinks,
  hasLink,
  linkOverSelection,
  safeHref,
  shortUrl,
  splitLinks,
  stripLinks,
  urlParts,
} from './links';

describe('links', () => {
  describe('findLinks', () => {
    it('finds a bare address with its scheme', () => {
      const [link] = findLinks('Review https://github.com/a/b/pull/52 today');
      expect(link.raw).toBe('https://github.com/a/b/pull/52');
      expect(link.href).toBe('https://github.com/a/b/pull/52');
      expect(link.label).toBeNull();
      expect(link.start).toBe(7);
    });

    it('adds https to an address that starts with www.', () => {
      expect(findLinks('see www.example.com')[0].href).toBe('https://www.example.com');
    });

    it('leaves sentence punctuation outside the address', () => {
      expect(findLinks('Look at https://x.de/a.')[0].raw).toBe('https://x.de/a');
      expect(findLinks('(see https://x.de/a)')[0].raw).toBe('https://x.de/a');
      expect(findLinks('**https://x.de/a**')[0].raw).toBe('https://x.de/a');
    });

    it('keeps brackets that belong to the address', () => {
      const raw = 'https://en.wikipedia.org/wiki/Angular_(web_framework)';
      expect(findLinks(`Read ${raw}.`)[0].raw).toBe(raw);
    });

    it('reads a markdown link with its label', () => {
      const [link] = findLinks('Send [the offer](https://shop.de/o?id=1) to Marco');
      expect(link.label).toBe('the offer');
      expect(link.href).toBe('https://shop.de/o?id=1');
      expect(link.raw).toBe('[the offer](https://shop.de/o?id=1)');
    });

    it('never makes a link of other schemes', () => {
      expect(findLinks('[x](javascript:alert(1))')).toEqual([]);
      expect(findLinks('data:text/html,hi')).toEqual([]);
      expect(safeHref('javascript:alert(1)')).toBeNull();
    });

    it('needs a real host', () => {
      expect(findLinks('https:// nothing')).toEqual([]);
      expect(findLinks('www.ab')).toEqual([]);
      expect(findLinks('http://localhost:4200/x')[0].href).toBe('http://localhost:4200/x');
    });

    it('ignores an address glued to a word', () => {
      expect(findLinks('foohttps://x.de')).toEqual([]);
    });

    it('is cheap for text without any address', () => {
      expect(hasLink('Buy milk')).toBe(false);
      expect(hasLink('Buy milk at www.milk.de')).toBe(true);
    });
  });

  describe('shortUrl', () => {
    it('drops scheme, www, query and hash', () => {
      expect(shortUrl('https://www.example.com/')).toBe('example.com');
      expect(shortUrl('https://example.com/a?b=1#c')).toBe('example.com/a');
    });

    it('keeps the last two parts of a long path', () => {
      expect(shortUrl('https://github.com/FlorianBohrer/Todo_App/pull/52')).toBe('github.com/…/pull/52');
    });

    it('keeps only the last part when the last two are long', () => {
      expect(shortUrl('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit')).toBe(
        'docs.google.com/…/edit',
      );
    });

    it('shortens a single very long part', () => {
      expect(shortUrl('https://x.de/' + 'a'.repeat(40))).toBe('x.de/' + 'a'.repeat(23) + '…');
    });

    it('makes percent encoding readable', () => {
      expect(shortUrl('https://de.wikipedia.org/wiki/K%C3%B6ln')).toBe('de.wikipedia.org/wiki/Köln');
    });
  });

  describe('urlParts', () => {
    it('adds up to exactly the text it came from', () => {
      for (const raw of [
        'https://www.github.com/FlorianBohrer/Todo_App/pull/52?tab=files#x',
        'www.example.com',
        'http://a.de/b/',
        'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit',
      ]) {
        const p = urlParts(raw);
        expect(p.scheme + p.www + p.host + p.mid + p.tail + p.rest).toBe(raw);
      }
    });

    it('names the parts', () => {
      expect(urlParts('https://www.github.com/a/b/pull/52?x=1')).toEqual({
        scheme: 'https://',
        www: 'www.',
        host: 'github.com',
        mid: '/a/b',
        tail: '/pull/52',
        rest: '?x=1',
      });
    });
  });

  describe('plain text', () => {
    it('shows a link as its label or short form', () => {
      expect(stripLinks('PR https://github.com/a/b/pull/52 and [offer](https://x.de)')).toBe(
        'PR github.com/…/pull/52 and offer',
      );
    });

    it('splits text and links in order', () => {
      expect(splitLinks('a https://x.de b').map((p) => [p.text, !!p.link])).toEqual([
        ['a ', false],
        ['x.de', true],
        [' b', false],
      ]);
    });
  });

  describe('linkOverSelection', () => {
    it('turns the selected words into a link', () => {
      expect(linkOverSelection('the offer', ' https://shop.de/o ')).toBe('[the offer](https://shop.de/o)');
    });

    it('pastes as usual without a selection or a single address', () => {
      expect(linkOverSelection('', 'https://shop.de')).toBeNull();
      expect(linkOverSelection('x', 'see https://shop.de')).toBeNull();
      expect(linkOverSelection('x', 'plain text')).toBeNull();
      expect(linkOverSelection('two\nlines', 'https://shop.de')).toBeNull();
    });

    it('replaces an address with an address', () => {
      expect(linkOverSelection('https://old.de', 'https://new.de')).toBeNull();
    });
  });
});
