# Product

## Register

product

## Users

Einzelpersonen, die ihre eigene Arbeit ordnen — kein Team-Tool, keine Zuweisungen, keine Kommentarspalten. Primär der Entwickler selbst (Frontend Engineer, arbeitet daran als vollständig durchgezogenes Full-Stack-Projekt) und Leute mit demselben Zuschnitt: viele parallele Vorhaben, wenig Lust auf Konfiguration.

Zwei Kontexte, die sich deutlich unterscheiden:

- **Abarbeiten** (Liste, Woche): kurze Besuche, oft am Handy, oft einhändig. Ziel ist ein Haken, nicht ein Aufenthalt. Alles muss in Sekunden erreichbar sein.
- **Planen** (Planungsmodus): lange Sitzungen am Laptop, meist unter Zeitdruck — der Abend vor einem Hackathon, das Durchdenken eines Features, die Woche vor einer Reise. Hier wird geschrieben, umgestellt, verworfen. Der Nutzer denkt beim Tippen; die Oberfläche darf ihn dabei nicht unterbrechen.

Aufgabe im Planungsmodus: aus einem diffusen Vorhaben in wenigen Minuten etwas werden lassen, das man jemandem zeigen kann — Text, Tabellen, später Ablaufdiagramme und Fotos. Nicht Dokumentation im Nachhinein, sondern Denken im Gehen.

## Product Purpose

Eine Todo-App, die den kompletten Weg vom Klick bis zur Datenbankzeile selbst gebaut hat: eigenes API, eigene Auth, eigenes Schema. Aus dem Lernprojekt ist ein Werkzeug geworden, das täglich benutzt wird — und das im Portfolio bestehen muss.

Der Planungsmodus ist die dritte Ansicht neben Liste und Woche. Er schließt die Lücke zwischen „Aufgabe abhaken" und „Vorhaben durchdenken": ein Plan gehört wahlweise zu einem Folder oder steht für sich, und besteht aus Blöcken (Text, Tabelle, später Diagramm und Bild), die entprellt automatisch gespeichert werden.

Erfolg heißt: Ein Vorhaben landet im Planungsmodus statt in einer Notiz-App, weil es dort schneller geht und danach neben den zugehörigen Todos liegt.

## Brand Personality

**Souverän, wertig, ruhig.** Erwachsene Software, keine Spielerei — aber auch keine Unternehmens-Kälte. Die App zeigt Können durch Sorgfalt, nicht durch Effekte: sichere Typografie, feine Materialität, zurückhaltende Bewegung.

Ton der Texte: knapp, sachlich, Englisch, ohne Ausrufezeichen und ohne Maskottchen-Freundlichkeit. Leere Zustände laden ein, statt zu entschuldigen. Fehlermeldungen sagen, was passiert ist und was jetzt hilft.

Emotional soll die App Zutrauen auslösen: „hier geht nichts verloren, und das sieht jemand gemacht, der es kann."

## Anti-references

**Keine KI-Standardoptik.** Der ausdrückliche Ausschluss:

- Kein Glassmorphism als Selbstzweck. Glas und Gradient sind in dieser App bewusst gesetztes Material (aus dem Referenz-Design übernommen: Gradient-Icon-Kacheln in Folder-Farbe, glasige Todo-Karten, Gradient-Fortschrittsbalken). Sie tragen Hierarchie und Farbidentität — sie sind keine Dekoration und werden nicht auf jede neue Fläche kopiert, nur weil es die App „so macht".
- Keine Gradient-Schrift, kein `background-clip: text`.
- Keine winzigen gesperrten Großbuchstaben-Überschriften über jedem Abschnitt.
- Keine identischen Karten-Raster als Standardantwort auf jede Liste. Wo eine Liste eine Liste ist, wird sie eine Liste.
- Keine farbigen Seitenstreifen als Akzent.

Ebenfalls nicht: die graue Dokumentenwüste (Notion-Imitat mit Slash-Menü), das bunte Team-Board (Trello/Asana-Chips), das Metrik-Kachel-Dashboard.

## Design Principles

1. **Der Plan ist das Dokument, nicht das Werkzeug.** Im Planungsmodus gehört die Fläche dem Inhalt. Werkzeuge erscheinen an dem Block, den sie betreffen, und verschwinden wieder — sie stehen nicht dauerhaft im Weg. Was der Nutzer geschrieben hat, ist das Auffälligste auf dem Bildschirm.
2. **Struktur entsteht beim Tippen.** Kein Setup, keine Vorlagenauswahl, kein Assistent. Ein neuer Plan ist sofort beschreibbar; Tabellen und Diagramme kommen dazu, wenn sie gebraucht werden. Der erste Tastendruck darf nie hinter einem Dialog liegen.
3. **Nichts geht verloren, und man sieht das.** Automatisch speichern ist die halbe Miete — die andere Hälfte ist, dass der Nutzer dem Zustand ansieht, dass gespeichert wurde. Optimistisch anzeigen, entprellt senden, Fehler ehrlich melden statt still schlucken.
4. **Material mit Absicht.** Glas, Gradient und Blur sind vorhanden und dürfen benutzt werden — aber nur dort, wo sie eine Ebene, eine Zugehörigkeit oder einen Fortschritt sichtbar machen. Farbe kommt aus dem Folder-System, nicht aus Laune.
5. **Vorzeigbar an jeder Stelle.** Das Projekt ist auch Portfolio. Jede Fläche, auch der leere Zustand und der Fehlerfall, muss einem zweiten Blick standhalten.

## Accessibility & Inclusion

**WCAG 2.1 AA, konsequent.**

- Kontraste geprüft: Fließtext ≥ 4.5:1, große Schrift ≥ 3:1, Platzhalter ebenfalls 4.5:1 (`--color-subtle #5E6680` auf dunklem Grund ist dafür zu schwach und darf nicht für lesbaren Text stehen).
- Alles per Tastatur bedienbar, mit sichtbarem Fokusring. Tabellen im Planungsmodus müssen sich per Tab durchlaufen lassen.
- Drag & Drop (Todo-Reihenfolge, Woche, Blöcke) braucht eine Tastatur-Alternative — Verschieben darf nie nur mit der Maus möglich sein.
- `prefers-reduced-motion` wird respektiert: jede Bewegung hat eine ruhige Entsprechung.
- Zustände nie allein über Farbe transportieren (Folder-Farbe immer zusammen mit Name oder Icon).
- Screenreader: Regionen benannt, Statusänderungen (gespeichert, Fehler) über `role="status"` angesagt.
