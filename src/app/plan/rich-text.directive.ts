import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
} from '@angular/core';
import { ShortcutService } from '../shared/shortcut.service';
import type { ShortcutAction } from '../shared/shortcuts';
import { ANCHOR, caretIn, justClosed, placeCaret, renderRich, scanRich } from './rich-text';

/** Tastenkuerzel -> Browserbefehl. Die Tasten selbst sind umbelegbar. */
const COMMANDS: Partial<Record<ShortcutAction, string>> = {
  'format.bold': 'bold',
  'format.italic': 'italic',
  'format.underline': 'underline',
  'format.strike': 'strikeThrough',
};

/**
 * Ein Feld, in dem formatierter Text steht — und zwar waehrend man schreibt.
 *
 * Der Unterschied zum bisherigen Feld ist der ganze Punkt: dort war ein Block
 * entweder gerendert ODER ein Rohtext-Kasten voller Sternchen. Hier gibt es nur
 * einen Zustand. „**fett**" wird fett, sobald die zweiten Sternchen stehen; bis
 * dahin sieht man, was man tippt.
 *
 * Nach aussen bleibt alles Markdown: was hereinkommt, wird gezeichnet, was
 * herausgeht, ist wieder Markdown. Der Rest des Plans (Suche, Wikilinks,
 * Einfuegen, Export) muss von contenteditable nichts wissen.
 *
 * Die Tastenbelegung ist die von Notion: Enter teilt den Block, Rueckschritt am
 * Anfang fuegt ihn mit dem darueber zusammen, die Pfeiltasten verlassen ihn an
 * der Kante, Tabulator rueckt ein. Entschieden wird das hier nur; WAS dabei
 * passiert, weiss der Plan — deshalb Ereignisse statt Logik.
 */
@Directive({
  selector: '[appRichText]',
  host: {
    contenteditable: 'true',
    class: 'rich-text',
    role: 'textbox',
    '[attr.aria-multiline]': 'true',
  },
})
export class RichText {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly shortcuts = inject(ShortcutService);

  /** Zuletzt gelesener Stand. Verhindert, dass der eigene Tastendruck als
   *  fremde Aenderung zurueckkommt und das Feld neu zeichnet. */
  private last: string | null = null;

  /** Waehrend einer Zeicheneingabe (asiatische Tastaturen, Akzente) steht der
   *  Text im Feld noch nicht fest — dann nichts anfassen. */
  private composing = false;

  @Input({ alias: 'appRichText', required: true })
  set text(value: string) {
    if (value === this.last) return;
    this.last = value;
    this.paint(value);
  }

  /**
   * Ist ein Menue offen (Slash, Wikilink), gehoeren Pfeile und Enter ihm.
   * Ohne diese Bremse wuerde die Auswahl im Menue den Block teilen.
   */
  @Input() richTextMenuOpen = false;

  @Output() readonly textChange = new EventEmitter<{ value: string; caret: number }>();
  /** Enter: der Text links und rechts vom Cursor. */
  @Output() readonly split = new EventEmitter<{ before: string; after: string }>();
  /** Rueckschritt ganz am Anfang. */
  @Output() readonly mergeBack = new EventEmitter<void>();
  /** Pfeiltaste ueber die obere bzw. untere Kante hinaus. */
  @Output() readonly navigate = new EventEmitter<'up' | 'down'>();
  /** Tabulator: eine Ebene rein oder raus. */
  @Output() readonly indent = new EventEmitter<1 | -1>();
  @Output() readonly escaped = new EventEmitter<void>();
  @Output() readonly blurred = new EventEmitter<void>();
  @Output() readonly pasted = new EventEmitter<ClipboardEvent>();

  // ---- Lesen ----

  private read(): { md: string; caret: number } {
    const scan = scanRich(this.host.nativeElement);
    const selection = document.getSelection();
    const caret =
      selection && selection.rangeCount
        ? caretIn(scan, selection.anchorNode, selection.anchorOffset)
        : -1;
    return { md: scan.md, caret };
  }

  private paint(md: string): void {
    const el = this.host.nativeElement;
    const html = md ? renderRich(md) : '';
    if (el.innerHTML !== html) el.innerHTML = html;
    el.dataset['empty'] = md ? 'false' : 'true';
  }

  /**
   * Stand melden — und neu zeichnen, wenn gerade eine Auszeichnung fertig
   * geworden ist.
   *
   * Nur dann: bei jedem Anschlag neu zu zeichnen wuerde Cursor, Auswahl und den
   * Rueckgaengig-Stapel des Browsers wegwerfen.
   */
  private sync(redraw: boolean): void {
    const { md, caret } = this.read();

    if (redraw && caret >= 0 && justClosed(md.slice(0, caret))) {
      this.paint(md);
      placeCaret(this.host.nativeElement, caret);
    } else {
      this.host.nativeElement.dataset['empty'] = md ? 'false' : 'true';
    }

    this.last = md;
    this.textChange.emit({ value: md, caret });
  }

  // ---- Schreiben ----

  @HostListener('input')
  onInput(): void {
    if (this.composing) return;
    this.sync(true);
  }

  @HostListener('compositionstart')
  onCompositionStart(): void {
    this.composing = true;
  }

  @HostListener('compositionend')
  onCompositionEnd(): void {
    this.composing = false;
    this.sync(true);
  }

  @HostListener('blur')
  onBlur(): void {
    // Die Cursor-Anker haben ausgedient, sobald der Cursor weg ist: neu
    // zeichnen raeumt sie weg.
    const md = scanRich(this.host.nativeElement).md;
    this.last = md;
    this.paint(md);
    this.blurred.emit();
  }

  /**
   * Einen unsichtbaren Anker vor dem Cursor wegnehmen, bevor der Rueckschritt
   * ihn trifft.
   *
   * Sonst kostet er einen Tastendruck, bei dem nichts passiert — und nichts
   * ist aergerlicher als eine Taste, die scheinbar nicht funktioniert.
   */
  private dropAnchorBeforeCaret(): void {
    const selection = document.getSelection();
    const node = selection?.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    if (node.nodeValue !== ANCHOR || selection?.anchorOffset !== 1) return;

    const parent = node.parentNode;
    if (!parent) return;
    const at = Array.prototype.indexOf.call(parent.childNodes, node);
    parent.removeChild(node);

    const range = document.createRange();
    range.setStart(parent, at);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  /**
   * Eingefuegtes kommt als Text herein, nie als fremdes HTML.
   *
   * Der Plan darf vorher ran: ein ganzes Markdown-Dokument wird dort in echte
   * Bloecke zerlegt. Greift er nicht zu, landet schlichter Text im Feld —
   * Schriftarten und Farben aus anderen Programmen bleiben draussen.
   */
  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    this.pasted.emit(event);
    if (event.defaultPrevented) return;

    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (text) document.execCommand('insertText', false, text);
    this.sync(true);
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    // Formatierung zuerst: mit gedrueckter Befehlstaste ist nie ein Menue
    // gemeint, und die Taste darf nicht nebenbei den Block teilen.
    const action = this.shortcuts.match(event);
    const command = action ? COMMANDS[action] : undefined;
    if (command) {
      event.preventDefault();
      this.exec(command);
      return;
    }

    if (this.richTextMenuOpen) return;

    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        if (event.shiftKey) {
          // Weicher Umbruch: eine Zeile mehr im selben Block, wie in Notion.
          document.execCommand('insertLineBreak');
          this.sync(false);
          return;
        }
        {
          const { md, caret } = this.read();
          const at = caret < 0 ? md.length : caret;
          this.split.emit({ before: md.slice(0, at), after: md.slice(at) });
        }
        return;

      case 'Backspace': {
        const selection = document.getSelection();
        if (selection && !selection.isCollapsed) return; // Auswahl loeschen
        this.dropAnchorBeforeCaret();
        if (this.read().caret !== 0) return;
        event.preventDefault();
        this.mergeBack.emit();
        return;
      }

      case 'Tab':
        // Nur wo Einruecken ueberhaupt etwas bedeutet (Listen). Sonst bleibt
        // der Tabulator, was er ist: der Weg zum naechsten Bedienelement.
        if (!this.indent.observed) return;
        event.preventDefault();
        this.indent.emit(event.shiftKey ? -1 : 1);
        return;

      case 'Escape':
        event.preventDefault();
        this.host.nativeElement.blur();
        this.escaped.emit();
        return;

      case 'ArrowUp':
        if (this.edge().first) {
          event.preventDefault();
          this.navigate.emit('up');
        }
        return;

      case 'ArrowDown':
        if (this.edge().last) {
          event.preventDefault();
          this.navigate.emit('down');
        }
        return;
    }
  }

  private exec(command: string): void {
    // Ohne das schreibt der Browser <span style="font-weight:bold"> statt <b>,
    // und aus einem style-Attribut laesst sich kein Markdown machen.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command);
    this.sync(false);
  }

  /**
   * Steht der Cursor auf der ersten bzw. letzten Zeile des Feldes?
   *
   * Gemessen, nicht gezaehlt: ein Absatz bricht um, und die Pfeiltaste soll
   * innerhalb des Absatzes die Zeile wechseln und erst an dessen Kante den
   * Block verlassen. Die Zeichenposition weiss davon nichts, das Rechteck schon.
   */
  private edge(): { first: boolean; last: boolean } {
    const selection = document.getSelection();
    if (!selection || !selection.rangeCount) return { first: true, last: true };

    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    const caret = range.getBoundingClientRect();
    // Leeres Feld oder leerer Knoten: kein Rechteck — dann ist es beides.
    if (caret.height === 0) return { first: true, last: true };

    const box = this.host.nativeElement.getBoundingClientRect();
    return {
      first: caret.top - box.top < 6,
      last: box.bottom - caret.bottom < 6,
    };
  }
}
