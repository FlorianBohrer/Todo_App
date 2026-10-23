/**
 * Übersetzungsmodus: welche Texte eines Plans übersetzt werden, und wie die
 * Übersetzungen wieder an ihre Stelle kommen.
 *
 * Übersetzt wird, was man liest: Titel, Absätze, Überschriften, Zitate,
 * Listenpunkte, Tabellenköpfe und -zellen, Toggle-Titel — und bei Diagrammen
 * die Beschriftungen (der Server bekommt den Quelltext als „mermaid" und lässt
 * die Syntax stehen). Code bleibt Code.
 *
 * Einsammeln und Einsetzen laufen durch DIESELBE Funktion (mapTexts), in
 * derselben Reihenfolge — so kann die n-te Übersetzung nie am falschen Block
 * landen. Felder ohne Buchstaben werden gar nicht erst geschickt.
 *
 * Reine Funktionen, ohne Angular.
 */
import { PlanBlock } from './plan.model';

export type TranslateTarget = 'de' | 'en';
export type TranslateKind = 'text' | 'mermaid';

export interface TranslateItem {
  text: string;
  kind: TranslateKind;
}

export interface PlanTexts {
  title: string;
  content: PlanBlock[];
}

type Visit = (text: string, kind: TranslateKind) => string;

/** Jeden lesbaren Text eines Plans durch `visit` schicken — in fester Reihenfolge. */
function mapTexts({ title, content }: PlanTexts, visit: Visit): PlanTexts {
  // Ohne einen einzigen Buchstaben gibt es nichts zu übersetzen: leere
  // Felder, „1200 €", „—", „3/5". Die gehen gar nicht erst raus.
  const text = (value: string, kind: TranslateKind = 'text') => (/\p{L}/u.test(value) ? visit(value, kind) : value);

  const blocks = (list: readonly PlanBlock[]): PlanBlock[] =>
    list.map((block): PlanBlock => {
      switch (block.type) {
        case 'text':
        case 'heading':
        case 'quote':
          return { ...block, text: text(block.text) };
        case 'list':
          return { ...block, items: block.items.map((item) => ({ ...item, text: text(item.text) })) };
        case 'table':
          return {
            ...block,
            columns: block.columns.map((c) => text(c)),
            rows: block.rows.map((row) => row.map((cell) => text(cell))),
          };
        case 'group':
          return { ...block, title: text(block.title), blocks: blocks(block.blocks) };
        case 'diagram':
          return { ...block, code: text(block.code, 'mermaid') };
        default:
          return block;
      }
    });

  return { title: text(title), content: blocks(content) };
}

/** Was übersetzt werden muss, in der Reihenfolge, in der es zurückkommt. */
export function collectTexts(plan: PlanTexts): TranslateItem[] {
  const items: TranslateItem[] = [];
  mapTexts(plan, (text, kind) => {
    items.push({ text, kind });
    return text;
  });
  return items;
}

/** Die Übersetzungen einsetzen — n-te Übersetzung an den n-ten Text. */
export function applyTexts(plan: PlanTexts, translations: readonly string[]): PlanTexts {
  let next = 0;
  return mapTexts(plan, (text) => translations[next++] ?? text);
}

const GERMAN = new Set(
  'der die das und ist nicht mit für auf ein eine einen zu von im den dem des sich auch wir ich es wird werden sind oder aber wenn noch nach bei über unter'.split(' '),
);
const ENGLISH = new Set(
  'the and is not with for on a an to of in it we i be are or but if will this that from at by about under'.split(' '),
);

/**
 * In welcher Sprache ist der Plan geschrieben? Ein Zählen häufiger Wörter —
 * grob, aber genug, um die naheliegende Richtung vorzuschlagen. Umlaute und
 * ß zählen für Deutsch.
 */
export function guessLanguage(text: string): TranslateTarget {
  let de = (text.match(/[äöüß]/gi) ?? []).length;
  let en = 0;
  for (const word of text.toLowerCase().match(/[a-zäöüß]+/g) ?? []) {
    if (GERMAN.has(word)) de++;
    if (ENGLISH.has(word)) en++;
  }
  return de > en ? 'de' : 'en';
}

/**
 * Übersetzte Diagramme, die nicht mehr zeichnen, gegen das Original tauschen.
 *
 * Das Modell soll nur Beschriftungen anfassen, aber eine Klammer oder ein
 * Pfeil kann trotzdem verrutschen — und ein Diagramm, das statt eines Bilds
 * einen Syntaxfehler zeigt, ist schlechter als eines in der alten Sprache.
 * Geprüft wird nur, was als „mermaid" ging und sich verändert hat.
 */
export async function keepValidDiagrams(
  items: readonly TranslateItem[],
  translations: readonly string[],
  isValid: (code: string) => Promise<boolean>,
): Promise<string[]> {
  return Promise.all(
    translations.map(async (translated, i) => {
      const item = items[i];
      if (item?.kind !== 'mermaid' || translated === item.text) return translated;
      return (await isValid(translated).catch(() => false)) ? translated : item.text;
    }),
  );
}

/**
 * In Pakete teilen, die der Server annimmt (12 000 Zeichen, 200 Texte je
 * Anfrage) — mit Abstand zur Grenze. Ein einzelner Text über der Grenze
 * bekommt ein Paket für sich; der Server lehnt ihn dann ab, der Rest kommt
 * trotzdem durch. Zurück kommen die Positionen, nicht die Texte.
 */
export function batchTexts(items: readonly TranslateItem[], maxChars = 10000, maxItems = 180): number[][] {
  const batches: number[][] = [];
  let current: number[] = [];
  let chars = 0;

  items.forEach((item, index) => {
    const size = item.text.length;
    if (current.length && (chars + size > maxChars || current.length >= maxItems)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(index);
    chars += size;
  });
  if (current.length) batches.push(current);
  return batches;
}
