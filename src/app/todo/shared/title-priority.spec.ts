import {
  MOSCOW_LABEL,
  orderWithSubtasks,
  priorityBadge,
  stripPriorityPrefix,
  taskLevel,
  titlePriority,
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
