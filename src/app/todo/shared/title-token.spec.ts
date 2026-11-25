import { priorityBadge, taskLevel, titlePriority } from './title-priority';
import { joinTitle, pullTokens, pullTyped, splitTitle, tokensOf, typedTitle, withToken } from './title-token';

describe('title tokens', () => {
  it('reads every prefix as a token', () => {
    expect(tokensOf('/must Ship it')).toEqual(['must']);
    expect(tokensOf('/should Ship it')).toEqual(['should']);
    expect(tokensOf('/could Ship it')).toEqual(['could']);
    expect(tokensOf("/won't Ship it")).toEqual(['wont']);
    expect(tokensOf('/wont Ship it')).toEqual(['wont']);
    expect(tokensOf('/main Ship it')).toEqual(['main']);
    expect(tokensOf('/sub Ship it')).toEqual(['sub']);
    expect(tokensOf('Ship it')).toEqual([]);
  });

  it('reads a priority and a level together, in either order', () => {
    // So hatte es jemand geschrieben — und sah „/sub" als Text, weil nur das
    // erste Präfix zählte.
    expect(splitTitle('/must /sub Renew the passport')).toEqual({
      tokens: ['must', 'sub'],
      text: 'Renew the passport',
    });
    expect(splitTitle('/sub /must Renew the passport')).toEqual({
      tokens: ['must', 'sub'],
      text: 'Renew the passport',
    });
  });

  it('never leaves a second prefix of the same kind as text', () => {
    expect(splitTitle('/must /should Ship it')).toEqual({ tokens: ['must'], text: 'Ship it' });
  });

  it('only takes a prefix once the space after it is typed', () => {
    expect(splitTitle('/mu')).toEqual({ tokens: [], text: '/mu' });
    expect(splitTitle('/must')).toEqual({ tokens: [], text: '/must' });
    expect(splitTitle('/must ')).toEqual({ tokens: ['must'], text: '' });
    expect(splitTitle('/MUST Ship it')).toEqual({ tokens: ['must'], text: 'Ship it' });
    expect(splitTitle('/must /su')).toEqual({ tokens: ['must'], text: '/su' });
  });

  it('leaves a slash in the middle of the text alone', () => {
    expect(splitTitle('Read /must docs')).toEqual({ tokens: [], text: 'Read /must docs' });
  });

  it('puts the prefixes back so sorting, nesting and XP keep working', () => {
    const must = joinTitle(['must'], 'Ship it');
    const wont = joinTitle(['wont'], 'Rewrite');
    const sub = joinTitle(['sub'], 'One step');
    const mustStep = joinTitle(['sub', 'must'], 'Renew the passport');

    expect(must).toBe('/must Ship it');
    expect(priorityBadge(must)).toBe('must');
    expect(titlePriority(wont)).toBe(4);
    expect(taskLevel(sub)).toBe('sub');
    expect(mustStep).toBe('/must /sub Renew the passport');
    expect(priorityBadge(mustStep)).toBe('must');
    expect(taskLevel(mustStep)).toBe('sub');
  });

  it('round-trips', () => {
    const titles = ['/must A', '/should B', '/could C', "/won't D", '/main E', '/sub F', 'G', '/must /main H'];
    for (const title of titles) {
      const { tokens, text } = splitTitle(title);
      expect(joinTitle(tokens, text)).toBe(title);
    }
  });

  it('adds nothing to an empty text', () => {
    expect(joinTitle(['must'], '')).toBe('');
    expect(joinTitle(['must', 'sub'], '   ')).toBe('   ');
  });

  it('lets a prefix typed into the text win on its own axis', () => {
    expect(joinTitle(['sub'], '/main Back to the top')).toBe('/main Back to the top');
    expect(joinTitle(['must', 'sub'], '/could Later')).toBe('/could /sub Later');
  });
});

describe('withToken', () => {
  it('replaces the token of the same kind and keeps the other', () => {
    expect(withToken(['must'], 'sub')).toEqual(['must', 'sub']);
    expect(withToken(['must', 'sub'], 'should')).toEqual(['should', 'sub']);
    expect(withToken(['must', 'sub'], 'main')).toEqual(['must', 'main']);
    expect(withToken([], 'sub')).toEqual(['sub']);
  });
});

describe('time of day and duration as tokens', () => {
  it('reads them as tokens after priority and level', () => {
    expect(splitTitle('/30m /evening /must Lesen')).toEqual({
      tokens: ['must', 'evening', '30m'],
      text: 'Lesen',
    });
  });

  it('replaces only the token on the same axis', () => {
    expect(withToken(['must', 'morning', '15m'], 'evening')).toEqual(['must', 'evening', '15m']);
    expect(withToken(['must', 'morning', '15m'], '45m')).toEqual(['must', 'morning', '45m']);
  });

  it('writes them back in order', () => {
    expect(joinTitle(['sub', '90m', 'afternoon'], 'Bericht')).toBe('/sub /afternoon /1h30m Bericht');
    expect(joinTitle(['morning'], '/20m Wasser trinken')).toBe('/morning /20m Wasser trinken');
  });
});

describe('tokens anywhere in what was typed', () => {
  it('takes them from the end, the start and the middle', () => {
    expect(pullTokens('Mittagessen /afternoon /1h /must', true)).toEqual({
      tokens: ['must', 'afternoon', '60m'],
      text: 'Mittagessen',
    });
    expect(pullTokens('/must Ship it', true)).toEqual({ tokens: ['must'], text: 'Ship it' });
    expect(pullTokens('Ship /must it', true)).toEqual({ tokens: ['must'], text: 'Ship it' });
    expect(pullTokens('Arzt /won’t', true)).toEqual({ tokens: ['wont'], text: 'Arzt' });
  });

  it('waits for the space while typing at the very end', () => {
    // „/1h" kann noch „/1h30m" werden.
    expect(pullTokens('Lesen /1h')).toEqual({ tokens: [], text: 'Lesen /1h' });
    expect(pullTokens('Lesen /1h ')).toEqual({ tokens: ['60m'], text: 'Lesen ' });
    expect(pullTokens('Lesen /1h30m', true)).toEqual({ tokens: ['90m'], text: 'Lesen' });
  });

  it('leaves slashes that are not tokens alone', () => {
    const texts = ['and/or /later', 'https://x.com/must now', 'Pfad /usr/bin', '12/3 /0m', 'Lies /must,'];
    for (const text of texts) expect(pullTokens(text, true)).toEqual({ tokens: [], text });
  });

  it('keeps the lines of a description', () => {
    expect(pullTokens('Kopf /must\nZeile zwei /15m', true)).toEqual({
      tokens: ['must', '15m'],
      text: 'Kopf\nZeile zwei',
    });
  });

  it('pulls only left of the cursor and says where it goes', () => {
    // „/must " gerade fertig getippt, mitten im Satz.
    expect(pullTyped('Suppe /must  Dal', 12)).toEqual({ tokens: ['must'], text: 'Suppe Dal', caret: 6 });
    // Am Cursor wird noch getippt.
    expect(pullTyped('Suppe /mus', 10)).toBeNull();
    expect(pullTyped('/must ', 6)).toEqual({ tokens: ['must'], text: '', caret: 0 });
  });

  it('builds the stored title: tokens in front, dash heading, chips', () => {
    expect(typedTitle('Mittagessen– Suppe oder Dal /afternoon /1h /must')).toBe(
      '/must /afternoon /1h **Mittagessen**\nSuppe oder Dal',
    );
    // Ein getipptes Zeichen schlägt den Chip derselben Art.
    expect(typedTitle('Bericht /could', ['must', '30m'])).toBe('/could /30m Bericht');
    expect(typedTitle('Plan – Ideen', [], { heading: false })).toBe('Plan – Ideen');
    expect(typedTitle('/must')).toBe('');
  });
});
