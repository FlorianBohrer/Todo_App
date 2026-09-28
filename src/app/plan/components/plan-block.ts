import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgClass, NgTemplateOutlet } from '@angular/common';
import { OverlayModule } from '@angular/cdk/overlay';
import {
  CdkDrag,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { LucideAngularModule } from 'lucide-angular';
import { Autosize } from '../../directives/autosize.directive';
import { RichText } from '../rich-text.directive';
import { MermaidDiagram } from './mermaid-diagram';
import type { PlanBlock } from '../plan.model';
// Nur als Typ: der Import verschwindet beim Uebersetzen, und damit auch der
// Kreis zwischen Ansicht und Block (die Ansicht braucht diese Komponente, um
// sie zu zeigen).
import type { ListRow, PlansView } from './plans-view';

/**
 * Ein Block des Dokuments — als eigene Komponente, damit die
 * Aenderungserkennung ihn ueberspringen kann.
 *
 * Vorher hing das ganze Dokument in einer Vorlage: jeder Durchlauf rechnete
 * die Bindungen ALLER Bloecke neu, auch wenn nur in einem getippt wurde. Mit
 * OnPush prueft Angular einen Block nur noch, wenn sich seine Eingaben
 * aendern — und die aendern sich nur bei dem Block, den man bearbeitet, weil
 * jede Aenderung unveraenderlich ersetzt und alle uebrigen Bloecke danach
 * dieselben Objekte sind.
 *
 * Die Bedienlogik bleibt bewusst in der Ansicht. Sie spannt ueber Bloecke
 * hinweg — Teilen legt einen Nachbarn an, Zusammenfuegen greift auf den Block
 * darueber, Ziehen ordnet die Geschwister um. Sie hierher zu holen hiesse,
 * sie zu zerschneiden; sie in einen Dienst zu heben, waere der naechste
 * Schritt, wenn die Ansicht weiter waechst.
 */
@Component({
  selector: 'app-plan-block',
  imports: [
    LucideAngularModule,
    NgClass,
    NgTemplateOutlet,
    OverlayModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    Autosize,
    RichText,
    MermaidDiagram,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-block.html',
  styleUrl: './plan-block.scss',
})
export class PlanBlockView {
  @Input({ required: true }) block!: PlanBlock;

  /** Die Ansicht, der dieser Block gehoert — sie fuehrt alle Befehle aus. */
  @Input({ required: true }) view!: PlansView;

  /**
   * Die fertigen Zeilen, wenn dieser Block eine Liste ist.
   *
   * Als Eingabe, nicht aus dem Signal gelesen: ein Signalzugriff in dieser
   * Vorlage machte die Komponente bei jeder Aenderung irgendwo im Dokument
   * wieder schmutzig und haette den Zweck der Uebung aufgehoben. Die Ansicht
   * reicht dieselbe Zeilenliste herein, solange sich die Liste nicht aendert.
   */
  @Input() rows: ListRow[] = [];
}
