import { SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { formatBlock } from './inline-format';

/**
 * Tabellenzellen gehen als [innerHTML] ins Markup — und damit durch Angulars
 * Sanitizer. Der ist genau richtig so: escapt wird ohnehin schon beim
 * Formatieren, und ein zweites Sieb kostet nichts.
 *
 * Nur muss durchkommen, was gemeint ist. Streicht der Sanitizer eines Tages
 * ein Tag aus der erlaubten Liste, faellt die Auszeichnung still weg — und
 * still ist das Schlimmste, was ein Fehler sein kann. Deshalb steht hier,
 * was ueberleben muss.
 */
describe('Tabellenzelle als innerHTML', () => {
  let sanitizer: DomSanitizer;

  beforeEach(() => {
    sanitizer = TestBed.inject(DomSanitizer);
  });

  const through = (markdown: string) =>
    sanitizer.sanitize(SecurityContext.HTML, formatBlock(markdown, { wikiLinks: false })) ?? '';

  it('keeps bold, italic, underline and strikethrough', () => {
    expect(through('**State**')).toBe('<strong>State</strong>');
    expect(through('*leise*')).toBe('<em>leise</em>');
    expect(through('__unter__')).toBe('<u>unter</u>');
    expect(through('~~weg~~')).toBe('<s>weg</s>');
  });

  it('keeps a code span with its class', () => {
    expect(through('`npm run build`')).toBe('<code class="plan-code">npm run build</code>');
  });

  it('keeps the line break of a two-line cell', () => {
    expect(through('oben\nunten')).toBe('oben<br>unten');
  });

  it('turns anything executable into text', () => {
    // Nicht „entfernt", sondern „escapt": was jemand tippt, bleibt sichtbar
    // — es ist nur kein Markup mehr. Deshalb steht „onerror" im Ergebnis,
    // aber als Zeichen und nicht als Attribut.
    expect(through('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(through('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });
});
