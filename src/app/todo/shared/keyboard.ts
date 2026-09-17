/**
 * Tippt der Nutzer gerade irgendwo?
 *
 * Buchstaben-Kürzel wie „n" oder „/" dürfen die Eingabe nie kapern — sonst
 * springt beim Schreiben eines Todos der Fokus weg, und das ist schlimmer als
 * gar kein Kürzel. Einmal zentral, weil jede Komponente mit einem Kürzel
 * dieselbe Frage stellt.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== 'string') return false;

  const tag = element.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;

  // isContentEditable ist die richtige Frage — sie berücksichtigt auch geerbte
  // Bearbeitbarkeit. Nicht jede Umgebung implementiert sie aber (Testrunner
  // etwa liefern undefined), deshalb fällt die Prüfung aufs Attribut zurück.
  if (element.isContentEditable === true) return true;

  const attribute = element.getAttribute?.('contenteditable');
  return attribute === '' || attribute === 'true';
}
