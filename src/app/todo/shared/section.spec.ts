import {
  isSection,
  moveToSection,
  pruneEmptySections,
  sectionName,
  sectionTitle,
} from './section';
import { moveWithSubtasks, orderWithSubtasks, subtaskGroups, taskLevel } from './title-priority';

const list = (...titles: string[]) => titles.map((title) => ({ id: title, title }));
const ids = (items: { id: string }[]) => items.map((i) => i.id);
const isStep = (title: string) => taskLevel(title) === 'sub';

describe('section', () => {
  it('reads the prefix and the name', () => {
    expect(isSection('/section Diese Woche')).toBe(true);
    expect(isSection('/Section  Später')).toBe(true);
    expect(isSection('/sectional')).toBe(false);
    expect(isSection('Section planning')).toBe(false);
    expect(sectionName('/section Diese Woche')).toBe('Diese Woche');
    expect(sectionTitle('  Später ')).toBe('/section Später');
  });

  it('never lets a section collect steps', () => {
    const groups = subtaskGroups(list('/section S', '/sub a1', 'B'));
    expect(groups.map((g) => g.map((i) => i.id))).toEqual([['/section S'], ['/sub a1'], ['B']]);
  });

  it('sorts by priority within each section, not across', () => {
    const items = list('C', '/section Later', 'X', '/must Y');
    expect(ids(orderWithSubtasks(items))).toEqual(['C', '/section Later', '/must Y', 'X']);
  });

  it('drags a section with everything in it', () => {
    const items = list('/section A', 'a1', 'a2', '/section B', 'b1');
    expect(moveWithSubtasks(items, '/section A', 'b1')).toEqual(['/section B', 'b1', '/section A', 'a1', 'a2']);
  });

  it('keeps the unsectioned top when a section is dragged up into it', () => {
    const items = list('top', '/section A', 'a1', '/section B', 'b1');
    expect(moveWithSubtasks(items, '/section B', 'top')).toEqual(['top', '/section B', 'b1', '/section A', 'a1']);
  });

  it('moves a task with its steps to the end of a section, or to the top area', () => {
    const items = list('A', '/sub a1', '/section S', 's1', '/section T');
    expect(ids(moveToSection(items, 'A', '/section S', isStep))).toEqual(['/section S', 's1', 'A', '/sub a1', '/section T']);
    expect(ids(moveToSection(items, 's1', null, isStep))).toEqual(['A', '/sub a1', 's1', '/section S', '/section T']);
  });

  it('drops sections without content', () => {
    const items = list('/section Empty', '/section Full', 'x', '/section Last');
    expect(ids(pruneEmptySections(items))).toEqual(['/section Full', 'x']);
  });
});
