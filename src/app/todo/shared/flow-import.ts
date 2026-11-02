/**
 * Arbeitszeiten, die vor der Statistik in Flow notiert wurden („Working
 * hours – October"). Flow nimmt sie bei jedem Start in seine Geschichte
 * (menubar/src/history-import.ts im Repo „timer"); auf dem Server stehen sie
 * nicht. Damit die Statistik hier dieselben Tage zeigt wie Flow, steht hier
 * dieselbe Liste — Flow ist die Quelle, ändert sie sich dort, muss sie hier
 * nachgezogen werden.
 *
 * Die Minuten folgen der Spalte „Hours" der Liste, auch wo die Uhrzeiten
 * etwas anderes ergeben würden (12.10.: 14:30–18:22, notiert als 4 h).
 */
import type { History, WorkBlock } from './focus-stats';

const block = (start: string | null, end: string | null, minutes: number): WorkBlock => ({
  start,
  end,
  minutes,
  source: 'import',
});

export const FLOW_IMPORT: History = {
  '2026-10-01': [block('09:00', '12:30', 210), block('14:00', '17:30', 210)],
  '2026-10-05': [block(null, null, 120), block(null, null, 60)],
  '2026-10-06': [block(null, null, 90), block(null, null, 60)],
  '2026-10-07': [block(null, null, 60), block(null, null, 120)],
  '2026-10-08': [block(null, null, 120), block(null, null, 120)],
  '2026-10-09': [block(null, null, 180), block(null, null, 180)],
  '2026-10-12': [block('09:10', '12:30', 200), block('14:30', '18:22', 240)],
  '2026-10-13': [block('09:00', '13:00', 240)],
  '2026-10-14': [block('09:00', '13:00', 240)],
  '2026-10-15': [block('14:00', '15:00', 60), block('16:00', '17:00', 60)],
  '2026-10-16': [block('09:00', '13:00', 240), block('14:00', '17:30', 210)],
  '2026-10-19': [block('09:30', '12:30', 180), block('13:30', '17:00', 210)],
  '2026-10-20': [block('09:00', '13:00', 240), block('14:00', '18:00', 240)],
};
