import {
  MOSCOW_LABEL,
  moveWithSubtasks,
  orderWithSubtasks,
  priorityBadge,
  stripPriorityPrefix,
  subtaskGroups,
  taskLevel,
  titlePriority,
  withTaskLevel,
} from './title-priority';

describe('priorityBadge', () => {
  it('reads all four MoSCoW levels', () => {
    expect(priorityBadge('/must renew the passport')).toBe('must');
    expect(priorityBadge('/should tidy the backlog')).toBe('should');
    expect(priorityBadge('/could repaint the shed')).toBe('could');
    expect(priorityBadge("/won't rewrite the parser")).toBe('wont');
  });

  it('accepts the apostrophe-free spelling of won\'t', () => {
    // Auf einer deutschen Tastatur ist das Apostroph keine Selbstverstaendlichkeit.
    expect(priorityBadge('/wont rewrite the parser')).toBe('wont');
  });

  it('ignores case and leading whitespace', () => {
    expect(priorityBadge('  /MUST call the landlord')).toBe('must');
    expect(priorityBadge('/Should call the landlord')).toBe('should');
  });

  it('returns null without a prefix', () => {
    expect(priorityBadge('call the landlord')).toBeNull();
    expect(priorityBadge('')).toBeNull();
  });

  it('needs the space — a bare word is not a prefix', () => {
    expect(priorityBadge('/mustard on the list')).toBeNull();
    expect(priorityBadge('/must')).toBeNull();
  });
});

describe('titlePriority', () => {
  it('orders the four levels, with unmarked between could and won\'t', () => {
    const must = titlePriority('/must a');
    const should = titlePriority('/should a');
    const could = titlePriority('/could a');
    const plain = titlePriority('a');
    const wont = titlePriority("/won't a");

    expect(must).toBeLessThan(should);
    expect(should).toBeLessThan(could);
    expect(could).toBeLessThan(plain);
    expect(plain).toBeLessThan(wont);
  });

  it('puts an unmarked todo above one explicitly ruled out', () => {
    // „Won't" ist eine Entscheidung gegen diesen Zeitraum — unbewertet ist das
    // nicht, also gehoert es darueber.
    expect(titlePriority('irgendwas')).toBeLessThan(titlePriority('/wont irgendwas'));
  });

  it('gives both spellings of won\'t the same weight', () => {
    expect(titlePriority("/won't a")).toBe(titlePriority('/wont a'));
  });
});

describe('stripPriorityPrefix', () => {
  it('removes the prefix and the space behind it', () => {
    expect(stripPriorityPrefix('/must renew the passport')).toBe('renew the passport');
    expect(stripPriorityPrefix('/should   tidy up')).toBe('tidy up');
    expect(stripPriorityPrefix("/won't rewrite")).toBe('rewrite');
    expect(stripPriorityPrefix('/wont rewrite')).toBe('rewrite');
  });

  it('leaves an unmarked title untouched', () => {
    expect(stripPriorityPrefix('renew the passport')).toBe('renew the passport');
  });

  it('removes only the first prefix', () => {
    expect(stripPriorityPrefix('/must /could both')).toBe('/could both');
  });
});

describe('MOSCOW_LABEL', () => {
  it('names every level', () => {
    expect(MOSCOW_LABEL.must).toBe('Must');
    expect(MOSCOW_LABEL.should).toBe('Should');
    expect(MOSCOW_LABEL.could).toBe('Could');
    expect(MOSCOW_LABEL.wont).toBe("Won't");
  });
});

describe('taskLevel', () => {
  it('reads the two structure prefixes', () => {
    expect(taskLevel('/main Einkaufen')).toBe('main');
    expect(taskLevel('/sub Milch')).toBe('sub');
  });

  it('is null for everything else', () => {
    expect(taskLevel('/must Einkaufen')).toBeNull();
    expect(taskLevel('Einkaufen')).toBeNull();
    // Ohne Leerzeichen ist es kein Praefix, sondern Text.
    expect(taskLevel('/submarine')).toBeNull();
  });

  it('strips the prefix from the shown title', () => {
    expect(stripPriorityPrefix('/sub Milch')).toBe('Milch');
    expect(stripPriorityPrefix('/main Einkaufen')).toBe('Einkaufen');
  });

  it('leaves structure prefixes unprioritised', () => {
    // Gliederung ist keine Gewichtung: beide zaehlen wie ohne Praefix.
    expect(titlePriority('/main x')).toBe(titlePriority('x'));
    expect(titlePriority('/sub x')).toBe(titlePriority('x'));
  });
});

describe('orderWithSubtasks', () => {
  const t = (title: string) => ({ title });

  it('keeps subtasks under their main task when the main task moves up', () => {
    // Genau der Fall, der die Einrueckung zur Luege machen wuerde: die
    // Hauptaufgabe rutscht als /must nach oben, die Unteraufgaben traegen
    // keine Stufe und blieben sonst unten zurueck.
    const out = orderWithSubtasks([
      t('/could Aufraeumen'),
      t('/must Einkaufen'),
      t('/sub Milch'),
      t('/sub Brot'),
    ]);

    expect(out.map((x) => x.title)).toEqual([
      '/must Einkaufen',
      '/sub Milch',
      '/sub Brot',
      '/could Aufraeumen',
    ]);
  });

  it('keeps equally ranked groups in the order the user dragged them', () => {
    const out = orderWithSubtasks([t('B'), t('/sub b1'), t('A'), t('/sub a1')]);
    expect(out.map((x) => x.title)).toEqual(['B', '/sub b1', 'A', '/sub a1']);
  });

  it('treats a subtask without a main task above it as its own task', () => {
    const out = orderWithSubtasks([t('/sub verwaist'), t('/must wichtig')]);
    expect(out.map((x) => x.title)).toEqual(['/must wichtig', '/sub verwaist']);
  });

  it('loses nothing and adds nothing', () => {
    const input = [t('a'), t('/sub a1'), t('/must b'), t('/sub b1'), t('c')];
    const out = orderWithSubtasks(input);
    expect(out).toHaveLength(input.length);
    expect([...out].sort((x, y) => x.title.localeCompare(y.title)))
      .toEqual([...input].sort((x, y) => x.title.localeCompare(y.title)));
  });

  it('handles an empty list', () => {
    expect(orderWithSubtasks([])).toEqual([]);
  });
});

describe('subtaskGroups', () => {
  const t = (title: string) => ({ title });

  it('puts each main task together with the subtasks below it', () => {
    const groups = subtaskGroups([
      t('/main Einkaufen'),
      t('/sub Milch'),
      t('/sub Brot'),
      t('Fenster putzen'),
    ]);

    expect(groups.map((g) => g.map((x) => x.title))).toEqual([
      ['/main Einkaufen', '/sub Milch', '/sub Brot'],
      ['Fenster putzen'],
    ]);
  });

  it('lets a plain task carry subtasks too', () => {
    // „/main" ist eine Auszeichnung, keine Bedingung: was ueber einer
    // Unteraufgabe steht, ist ihre Hauptaufgabe.
    const groups = subtaskGroups([t('Einkaufen'), t('/sub Milch')]);
    expect(groups).toHaveLength(1);
  });

  it('gives an orphaned subtask its own group', () => {
    const groups = subtaskGroups([t('/sub verwaist'), t('/main danach')]);
    expect(groups.map((g) => g.length)).toEqual([1, 1]);
  });
});

describe('moveWithSubtasks', () => {
  // Titel = ID, das macht die Erwartungen lesbar.
  const list = (...titles: string[]) => titles.map((title) => ({ id: title, title }));

  it('drags the subtasks along when the main task moves down', () => {
    // Der Fall, der ohne Mitnehmen Teilschritte verschenkt: A zieht an B
    // vorbei, a1/a2 blieben oben liegen und wuerden beim naechsten Sortieren
    // zu Unteraufgaben von B.
    const items = list('A', '/sub a1', '/sub a2', 'B', '/sub b1');
    expect(moveWithSubtasks(items, 'A', 'B')).toEqual([
      'B', '/sub b1', 'A', '/sub a1', '/sub a2',
    ]);
  });

  it('drags the subtasks along when the main task moves up', () => {
    const items = list('A', '/sub a1', 'B', '/sub b1');
    expect(moveWithSubtasks(items, 'B', 'A')).toEqual([
      'B', '/sub b1', 'A', '/sub a1',
    ]);
  });

  it('snaps to the edge of a group instead of splitting it', () => {
    // Zwischen B und b1 eingeschoben wuerde b1 zur Unteraufgabe von A.
    const items = list('A', 'B', '/sub b1', 'C');
    expect(moveWithSubtasks(items, 'A', '/sub b1')).toEqual([
      'B', '/sub b1', 'A', 'C',
    ]);
  });

  it('moves a single subtask on its own, so it can change parents', () => {
    const items = list('A', '/sub a1', 'B');
    expect(moveWithSubtasks(items, '/sub a1', 'B')).toEqual(['A', 'B', '/sub a1']);
  });

  it('puts a subtask dragged upwards in front of the row it was dropped on', () => {
    const items = list('A', '/sub a1', 'B', '/sub b1');
    expect(moveWithSubtasks(items, '/sub b1', '/sub a1')).toEqual([
      'A', '/sub b1', '/sub a1', 'B',
    ]);
  });

  it('refuses to drop a main task onto its own subtask', () => {
    const items = list('A', '/sub a1');
    expect(moveWithSubtasks(items, 'A', '/sub a1')).toBeNull();
  });

  it('returns null when there is nothing to move', () => {
    const items = list('A', 'B');
    expect(moveWithSubtasks(items, 'A', 'A')).toBeNull();
    expect(moveWithSubtasks(items, 'gibt es nicht', 'B')).toBeNull();
    expect(moveWithSubtasks(items, 'A', 'gibt es nicht')).toBeNull();
  });

  it('loses nothing and adds nothing', () => {
    const items = list('A', '/sub a1', 'B', '/sub b1', 'C');
    const out = moveWithSubtasks(items, 'C', 'A');
    expect(out).not.toBeNull();
    expect([...out!].sort()).toEqual(items.map((i) => i.id).sort());
  });
});

describe('withTaskLevel', () => {
  it('puts the prefix back after an edit', () => {
    // Die Runde, die eine Unteraufgabe ueberleben muss: Praefix weg fuers
    // Feld, Text geaendert, Praefix wieder dran.
    const stored = '/sub Milch';
    const shown = stripPriorityPrefix(stored);
    expect(shown).toBe('Milch');
    expect(withTaskLevel('Hafermilch', taskLevel(stored))).toBe('/sub Hafermilch');
  });

  it('leaves a task without a level alone', () => {
    expect(withTaskLevel('Milch', null)).toBe('Milch');
    expect(withTaskLevel('/must Milch', null)).toBe('/must Milch');
  });

  it('lets a typed prefix win — that is the way back out', () => {
    expect(withTaskLevel('/main Einkaufen', 'sub')).toBe('/main Einkaufen');
    expect(withTaskLevel('/must Milch', 'sub')).toBe('/must Milch');
  });

  it('keeps empty text empty, so an emptied field stays discardable', () => {
    expect(withTaskLevel('', 'sub')).toBe('');
    expect(withTaskLevel('   ', 'sub')).toBe('   ');
  });

  it('round-trips a main task as well', () => {
    expect(withTaskLevel('Einkaufen', 'main')).toBe('/main Einkaufen');
    expect(taskLevel(withTaskLevel('Einkaufen', 'main'))).toBe('main');
  });
});
