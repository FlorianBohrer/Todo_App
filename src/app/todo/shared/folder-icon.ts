import {
  LucideIconData,
  Briefcase,
  Mountain,
  Sun,
  CircleQuestionMark,
  Tag,
} from 'lucide-angular';

/**
 * Folder-Icon-Name (aus dem Backend) -> Lucide-Icon. Zentral, damit Liste,
 * Kacheln und Wochenansicht dieselbe Zuordnung nutzen.
 */
const ICONS: Record<string, LucideIconData> = {
  'briefcase': Briefcase,
  'mountain': Mountain,
  'sun': Sun,
  'question-mark-circle': CircleQuestionMark,
  'tag': Tag,
};

export function folderIcon(name: string | null | undefined): LucideIconData {
  return ICONS[name ?? ''] ?? Tag;
}
