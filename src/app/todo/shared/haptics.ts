/**
 * Ein kurzer Impuls zur Bestätigung.
 *
 * Nur für den einen Handgriff, um den es in einer Aufgabenliste geht: den
 * Haken. Alles andere zu vibrieren wäre dasselbe wie überall einen Ton
 * abzuspielen — nach dem dritten Mal ist es Lärm, und man schaltet es ab.
 *
 * 12 Millisekunden. Das ist kurz genug, dass es wie ein Klick wirkt und nicht
 * wie ein Summen; Android rundet ohnehin auf die kürzeste Stufe, die das Gerät
 * kann.
 *
 * Drei Gründe, warum hier nichts passiert, und keiner davon ist ein Fehler:
 * Safari und iOS kennen die Schnittstelle nicht, der Nutzer hat reduzierte
 * Bewegung eingestellt, oder der Browser hat die Erlaubnis entzogen (dann
 * wirft `vibrate` nicht, sondern gibt false zurück). In allen drei Fällen
 * bleibt der Haken genau so brauchbar — er ist nie auf das Zucken angewiesen.
 */
const TAP_MS = 12;

export function tap(): void {
  // Wer Bewegung reduziert, hat gesagt, dass er von Geräten nicht angestoßen
  // werden will. Das gilt auch, wenn der Stoß nicht zu sehen ist.
  if (prefersReducedMotion()) return;

  try {
    navigator.vibrate?.(TAP_MS);
  } catch {
    /* Kein Grund, einen Haken daran scheitern zu lassen. */
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // Kein matchMedia (Test, serverseitiges Rendern): dann lieber kein Zucken.
    return true;
  }
}
