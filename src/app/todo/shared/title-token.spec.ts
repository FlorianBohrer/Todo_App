import { priorityBadge, taskLevel, titlePriority } from './title-priority';
import { joinTitle, splitTitle, tokensOf, withToken } from './title-token';

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
