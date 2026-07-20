# Usability: Sichtbares Feedback, Undo beim Löschen, Ladezustand

## Problem

1. Alle 15 Fehlerpfade enden in `console.error` — der Nutzer erfährt nie,
   dass etwas nicht gespeichert wurde (Todo anlegen, Favorit, Timer, Sortierung …).
2. Das Favoriten-Limit (max. 3) schlägt aus dem mobilen ⋮-Menü **stumm** fehl.
3. Während des Ladens nach dem Login steht „No todos yet" — irreführend.
4. Löschen wirkt sofort und endgültig; mobil (⋮-Menü) ist ein Fehlklick schnell passiert.

## Akzeptanzkriterien

- Jeder fehlgeschlagene Serverzugriff zeigt einen sichtbaren Hinweis (Toast).
- Favoriten-Limit zeigt eine verständliche Meldung statt gar nichts.
- Während des initialen Ladens erscheint „Lade Todos…", kein falscher Leerzustand.
- Löschen zeigt 5 s einen „Rückgängig"-Toast; Undo stellt das Todo an alter
  Position wieder her, ohne dass je ein DELETE gesendet wurde.

## Design (drei Perspektiven)

**[Frontend]**
- `ToastService` (Signal-basiert): `show/success/error/dismiss`, Auto-Dismiss,
  optionale Aktion („Rückgängig"). `ToastContainer` fix unten zentriert,
  `aria-live="polite"`, Stil wie die bestehenden Menü-Panels.
- `TodoService.removeTodo`: optimistisch entfernen → Toast mit Undo →
  DELETE erst nach Ablauf (5 s). Undo bricht den Timer ab und fügt das Todo
  am alten Index wieder ein.
- `TodoService.loading`-Signal; `todo-list` zeigt Ladezustand vor Leerzustand.

**[Backend]** — keine Änderung. Bewusst: Undo per verzögertem DELETE statt
Re-POST, damit id/Position/Favorit/Timer erhalten bleiben.

**[Security]**
- Toast-Texte: statische deutsche Meldungen; einzig der Todo-Titel wird
  interpoliert — Angular-Interpolation escapet, kein `innerHTML` → kein XSS.
- Fehlermeldungen nennen keine Server-Interna (Details weiter in der Konsole).
- Keine neuen Endpoints/Rechte; Auth-Fluss unverändert.
- Trade-off: Schließt der Nutzer den Tab innerhalb der 5 s, wird das DELETE
  nie gesendet — das Todo taucht beim nächsten Laden wieder auf. Bewusst
  akzeptiert (kein Datenverlust, nur „zu wenig gelöscht").

## Nicht in diesem Schritt (Backlog)

Browser-Notification bei Timer-Ende; Skeleton statt Text-Lader; Undo auch für
Folder-Löschen (löscht heute die Kategorie-Zuordnung der Todos mit — dafür
bräuchte Undo Backend-Unterstützung).
