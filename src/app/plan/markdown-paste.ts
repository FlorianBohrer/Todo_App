/**
 * Zerlegt eingefügtes Markdown in Blöcke.
 *
 * Ohne das landet ein ganzes Dokument in einem einzigen Textblock — und wenn
 * es mit „# " beginnt, sogar als Text einer einzigen Überschrift, weil die
 * Kurzbefehl-Erkennung den kompletten Blockinhalt prüft.
 *
 * Reine Funktion: hier stecken die Kanten (zusammenhängende Listen, ein nicht
 * geschlossener Code-Zaun, ein „---" das ein Trenner ist statt einer
 * Aufzählung), und die gehören einzeln festgenagelt.
 */

export type ParsedBlock =
  | { kind: 'text'; text: string }
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'list'; variant: 'bullet' | 'number' | 'todo'; items: { text: string; checked: boolean }[] }
  | { kind: 'code'; language: string; code: string }
  | { kind: 'quote'; text: string }
  | { kind: 'divider' };

const HEADING = /^(#{1,3})[ \t]+(.*)$/;
const TODO_DASH = /^[-*][ \t]+\[([ xX]?)\][ \t]*(.*)$/;
const TODO_BARE = /^\[([ xX]?)\][ \t]+(.*)$/;
const BULLET = /^[-*][ \t]+(.*)$/;
const NUMBERED = /^\d+[.)][ \t]+(.*)$/;
const QUOTE = /^>[ \t]?(.*)$/;
const FENCE = /^```[ \t]*(.*)$/;
// Muss vor BULLET geprüft werden: „---" ist ein Trenner, keine Aufzählung.
const RULE = /^([-*_])\1{2,}[ \t]*$/;

function todoOf(line: string): { text: string; checked: boolean } | null {
  const dash = TODO_DASH.exec(line);
  if (dash) return { text: dash[2].trim(), checked: dash[1].toLowerCase() === 'x' };
  const bare = TODO_BARE.exec(line);
  if (bare) return { text: bare[2].trim(), checked: bare[1].toLowerCase() === 'x' };
  return null;
}

/** Beginnt die Zeile eine andere Blockart? Beendet einen laufenden Absatz. */
function startsBlock(line: string): boolean {
  return (
    RULE.test(line) ||
    HEADING.test(line) ||
    QUOTE.test(line) ||
    FENCE.test(line) ||
    BULLET.test(line) ||
    NUMBERED.test(line) ||
    TODO_BARE.test(line)
  );
}

export function parseMarkdownBlocks(input: string): ParsedBlock[] {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // --- Code-Zaun -------------------------------------------------------
    const fence = FENCE.exec(line);
    if (fence) {
      const language = fence[1].trim();
      const body: string[] = [];
      i++;
      // Ein nicht geschlossener Zaun laeuft bis zum Ende, statt alles
      // Folgende zu verschlucken oder abzubrechen.
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // schliessenden Zaun ueberspringen
      blocks.push({ kind: 'code', language, code: body.join('\n') });
      continue;
    }

    // --- Trenner ---------------------------------------------------------
    if (RULE.test(line)) {
      blocks.push({ kind: 'divider' });
      i++;
      continue;
    }

    // --- Überschrift -----------------------------------------------------
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, text: heading[2].trim() });
      i++;
      continue;
    }

    // --- Zitat: aufeinanderfolgende Zeilen gehoeren zusammen --------------
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        body.push(QUOTE.exec(lines[i])![1]);
        i++;
      }
      blocks.push({ kind: 'quote', text: body.join('\n').trim() });
      continue;
    }

    // --- Checkliste vor Aufzaehlung: „- [ ] " beginnt auch mit „- " ------
    if (todoOf(line)) {
      const items: { text: string; checked: boolean }[] = [];
      while (i < lines.length) {
        const item = todoOf(lines[i]);
        if (!item) break;
        items.push(item);
        i++;
      }
      blocks.push({ kind: 'list', variant: 'todo', items });
      continue;
    }

    // --- Aufzaehlung -----------------------------------------------------
    if (BULLET.test(line)) {
      const items: { text: string; checked: boolean }[] = [];
      while (i < lines.length && BULLET.test(lines[i]) && !todoOf(lines[i]) && !RULE.test(lines[i])) {
        items.push({ text: BULLET.exec(lines[i])![1].trim(), checked: false });
        i++;
      }
      blocks.push({ kind: 'list', variant: 'bullet', items });
      continue;
    }

    // --- Nummerierte Liste -----------------------------------------------
    if (NUMBERED.test(line)) {
      const items: { text: string; checked: boolean }[] = [];
      while (i < lines.length && NUMBERED.test(lines[i])) {
        items.push({ text: NUMBERED.exec(lines[i])![1].trim(), checked: false });
        i++;
      }
      blocks.push({ kind: 'list', variant: 'number', items });
      continue;
    }

    // --- Absatz: laeuft bis zur Leerzeile oder zum naechsten Blockanfang --
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) {
      paragraph.push(lines[i]);
      i++;
    }
    blocks.push({ kind: 'text', text: paragraph.join('\n') });
  }

  return blocks;
}
