import { priorityBadge, taskLevel, titlePriority } from './title-priority';
import { joinTitle, splitTitle, tokenOf } from './title-token';

describe('title tokens', () => {
  it('reads every prefix as a token', () => {
    expect(tokenOf('/must Ship it')).toBe('must');
    expect(tokenOf('/should Ship it')).toBe('should');
    expect(tokenOf('/could Ship it')).toBe('could');
    expect(tokenOf("/won't Ship it")).toBe('wont');
    expect(tokenOf('/wont Ship it')).toBe('wont');
    expect(tokenOf('/main Ship it')).toBe('main');
    expect(tokenOf('/sub Ship it')).toBe('sub');
    expect(tokenOf('Ship it')).toBeNull();
  });

  it('only takes a prefix once the space after it is typed', () => {
    expect(splitTitle('/mu')).toEqual({ token: null, text: '/mu' });
    expect(splitTitle('/must')).toEqual({ token: null, text: '/must' });
    expect(splitTitle('/must ')).toEqual({ token: 'must', text: '' });
    expect(splitTitle('/MUST Ship it')).toEqual({ token: 'must', text: 'Ship it' });
  });

  it('leaves a slash in the middle of the text alone', () => {
    expect(splitTitle('Read /must docs')).toEqual({ token: null, text: 'Read /must docs' });
  });

  it('puts the prefix back so sorting, nesting and XP keep working', () => {
    const must = joinTitle('must', 'Ship it');
    const wont = joinTitle('wont', 'Rewrite');
    const sub = joinTitle('sub', 'One step');

    expect(must).toBe('/must Ship it');
    expect(priorityBadge(must)).toBe('must');
    expect(titlePriority(wont)).toBe(4);
    expect(taskLevel(sub)).toBe('sub');
  });

  it('round-trips', () => {
    for (const title of ['/must A', '/should B', '/could C', "/won't D", '/main E', '/sub F', 'G']) {
      const { token, text } = splitTitle(title);
      expect(joinTitle(token, text)).toBe(title);
    }
  });

  it('adds nothing to an empty text', () => {
    expect(joinTitle('must', '')).toBe('');
    expect(joinTitle('must', '   ')).toBe('   ');
  });

  it('lets a prefix typed into the text win', () => {
    expect(joinTitle('sub', '/main Back to the top')).toBe('/main Back to the top');
  });
});
