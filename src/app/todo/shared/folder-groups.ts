/**
 * Unterteilt die Folder-Übersicht in Abschnitte.
 *
 * Zwei Arten, aus einem Grund getrennt: eine Sammlung, die der Nutzer pflegen
 * muss, ist am Anfang leer und damit nutzlos — eine, die sich aus den Namen
 * ergibt, steht schon beim ersten Öffnen da. Also beides:
 *
 *   'auto'   — abgeleitet aus dem, was ohnehin dasteht: Folder, deren Namen
 *              mit demselben Wort beginnen, stehen zusammen. Nichts
 *              einzurichten, nichts zu pflegen.
 *   'custom' — frei benannte Sammlungen, die am Folder hängen (Feld
 *              `collection`). Eine Sammlung IST die Menge der Folder mit
 *              demselben Namen; es gibt keinen Datensatz, der leer übrig
 *              bleiben könnte.
 *   'flat'   — wie bisher, ein Raster ohne Abschnitte.
 */
import type { Label } from '../services/label.service';
import { splitFolderName } from './folder-name';

export type FolderGrouping = 'flat' | 'auto' | 'custom';

export interface FolderGroup {
  /** Stabiler Schlüssel für @for und den Aufklapp-Zustand. */
  key: string;
  /** Überschrift des Abschnitts. */
  title: string;
  /** Die Folder darin, in ihrer gewohnten Reihenfolge. */
  labels: Label[];
  /**
   * true für den Sammelabschnitt am Ende ("Other" / "Unsorted"). Der ist keine
   * Sammlung, sondern der Rest — und darf deshalb kein Ziel beim Ziehen sein,
   * das eine Zuordnung SETZT: dorthin gezogen wird sie gelöscht.
   */
  rest: boolean;
}

/** Sammelabschnitt in der automatischen Gruppierung. */
export const AUTO_REST_KEY = '\u0000other';
/** Sammelabschnitt in den eigenen Sammlungen. */
export const CUSTOM_REST_KEY = '\u0000unsorted';

/**
 * Ab wie vielen Foldern ein gemeinsames Anfangswort einen Abschnitt bildet.
 *
 * Eins wäre kein Abschnitt, sondern eine Überschrift über einer einzelnen
 * Karte — das zerlegt die Übersicht, statt sie zu ordnen.
 */
const MIN_AUTO_GROUP = 2;

/**
 * Ein einzelner Buchstabe oder ein Kürzel benennt keinen Abschnitt.
 */
const MIN_TOKEN_LENGTH = 3;

/**
 * Wörter, die zwar lang genug sind, aber nichts über den Inhalt sagen.
 *
 * Ohne diese Liste stünden "Die Woche" und "Die Ideen" unter dem Abschnitt
 * "Die" — ein Abschnitt, der nur zeigt, dass zwei Namen mit demselben Artikel
 * beginnen. Die Längengrenze fängt das nicht ab: deutsche Artikel haben genau
 * drei Buchstaben, so viel wie "Uni", das ein gutes Anfangswort ist.
 */
const STOPWORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'und', 'oder',
  'für', 'fuer', 'von', 'mit', 'zum', 'zur', 'the', 'and', 'for', 'new', 'all',
]);

/**
 * Das Wort, unter dem ein Folder automatisch einsortiert wird.
 *
 * Erst der Prefix vor dem Doppelpunkt ("projekt: Bozen" → "projekt"), weil der
 * ausdrücklich gesetzt wurde. Ohne Doppelpunkt das erste Wort — so greift die
 * Gruppierung auch für "Bozen Live" und "Bozen Impact", ohne dass jemand eine
 * Schreibweise lernen muss. null, wenn nichts Brauchbares übrig bleibt.
 */
export function autoGroupToken(name: string): string | null {
  const { prefix, name: rest } = splitFolderName(name);
  const candidate = prefix ?? rest.split(/\s+/)[0] ?? '';
  // Satzzeichen am Rand abziehen: "Uni," und "Uni" sind dasselbe Wort.
  const token = candidate.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (token.length < MIN_TOKEN_LENGTH) return null;
  return STOPWORDS.has(token.toLocaleLowerCase()) ? null : token;
}

/** Groß-/Kleinschreibung trennt keine Abschnitte: "Uni" und "uni" gehören zusammen. */
function tokenKey(token: string): string {
  return token.toLocaleLowerCase();
}

/**
 * Baut die Abschnitte.
 *
 * Die Reihenfolge der Abschnitte folgt dem ersten Folder darin — also der
 * Reihenfolge, die der Nutzer selbst gezogen hat. Nach Größe zu sortieren
 * würde die Übersicht bei jeder Umbenennung neu mischen.
 */
export function groupFolders(
  labels: Label[],
  grouping: FolderGrouping,
): FolderGroup[] {
  if (grouping === 'flat') {
    return [{ key: '\u0000all', title: '', labels, rest: false }];
  }

  const groups = new Map<string, FolderGroup>();
  const rest: Label[] = [];

  for (const label of labels) {
    const raw =
      grouping === 'auto'
        ? autoGroupToken(label.name)
        : label.collection?.trim() || null;

    if (!raw) {
      rest.push(label);
      continue;
    }

    const key = tokenKey(raw);
    const existing = groups.get(key);
    if (existing) {
      existing.labels.push(label);
    } else {
      groups.set(key, { key, title: raw, labels: [label], rest: false });
    }
  }

  const sections: FolderGroup[] = [];

  for (const group of groups.values()) {
    // Ein Anfangswort, das nur einmal vorkommt, ist keine Gruppe — der Folder
    // gehört zu den Übrigen. Eine selbst vergebene Sammlung dagegen zählt auch
    // mit einem Mitglied: sie wurde bewusst angelegt.
    if (grouping === 'auto' && group.labels.length < MIN_AUTO_GROUP) {
      rest.push(...group.labels);
      continue;
    }
    sections.push(group);
  }

  if (rest.length > 0) {
    // Die Übrigen behalten ihre ursprüngliche Reihenfolge, auch wenn sie erst
    // nachträglich aus zu kleinen Gruppen dazugekommen sind.
    const order = new Map(labels.map((label, index) => [label.id, index]));
    rest.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    sections.push({
      key: grouping === 'auto' ? AUTO_REST_KEY : CUSTOM_REST_KEY,
      title: grouping === 'auto' ? 'Other' : 'Unsorted',
      labels: rest,
      rest: true,
    });
  }

  return sections;
}

/** Alle vergebenen Sammlungsnamen, alphabetisch — für Vorschläge und Ziele. */
export function collectionNames(labels: Label[]): string[] {
  const seen = new Map<string, string>();
  for (const label of labels) {
    const name = label.collection?.trim();
    // Die erste Schreibweise gewinnt — genau wie beim Abschnittstitel in
    // groupFolders. Sonst hieße dieselbe Sammlung im Menü anders als in der
    // Überschrift darüber.
    if (name && !seen.has(tokenKey(name))) seen.set(tokenKey(name), name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Rechnet eine Verschiebung INNERHALB eines Abschnitts auf die volle Liste um.
 *
 * Die Reihenfolge wird als eine Liste gespeichert; ein Abschnitt zeigt nur
 * einen Ausschnitt davon. Ohne diese Umrechnung würde ein Zug im zweiten
 * Abschnitt Folder im ersten vertauschen — die Indizes aus dem Ausschnitt
 * passen schlicht nicht auf das Ganze.
 *
 * Gibt die Indizes für `reorderLabels` zurück, oder null, wenn nichts zu tun
 * ist. Das Ziel ist der Platz des Folders, der dort gerade steht — damit
 * verhält sich das Ergebnis wie ein splice-Move in beide Richtungen.
 */
export function toGlobalMove(
  all: Label[],
  group: Label[],
  previousIndex: number,
  currentIndex: number,
): { previousIndex: number; currentIndex: number } | null {
  if (previousIndex === currentIndex) return null;

  const moved = group[previousIndex];
  const target = group[currentIndex];
  if (!moved || !target) return null;

  const from = all.findIndex((label) => label.id === moved.id);
  const to = all.findIndex((label) => label.id === target.id);
  if (from === -1 || to === -1 || from === to) return null;

  return { previousIndex: from, currentIndex: to };
}
