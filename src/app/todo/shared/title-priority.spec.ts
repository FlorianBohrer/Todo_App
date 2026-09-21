import {
  MOSCOW_LABEL,
  priorityBadge,
  stripPriorityPrefix,
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
