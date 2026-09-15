import { planLinkTargets, planPlainText } from './plan-links';
import { Plan, PlanBlock } from './plan.model';

function plan(content: PlanBlock[]): Plan {
  return {
    id: 'p1',
    title: 'Plan',
    categoryId: null,
    content,
    createdAt: '',
    updatedAt: '',
  };
}

describe('planLinkTargets', () => {
  it('collects links from text, headings and quotes', () => {
    const result = planLinkTargets(
      plan([
        { id: '1', type: 'text', text: 'see [[Alpha]]' },
        { id: '2', type: 'heading', level: 1, text: 'about [[Beta]]' },
        { id: '3', type: 'quote', text: 'cited [[Gamma]]' },
      ]),
    );

    expect(result).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('collects links from list items', () => {
    const result = planLinkTargets(
      plan([
        {
          id: '1',
          type: 'list',
          variant: 'bullet',
          items: [
            { text: 'one [[Alpha]]', checked: false },
            { text: 'two [[Beta]]', checked: true },
          ],
        },
      ]),
    );

    expect(result).toEqual(['Alpha', 'Beta']);
  });

  it('reaches into nested sections, including their titles', () => {
    const result = planLinkTargets(
      plan([
        {
          id: 'g1',
          type: 'group',
          title: 'Section on [[Alpha]]',
          collapsed: false,
          blocks: [
            {
              id: 'g2',
              type: 'group',
              title: 'Nested',
              collapsed: false,
              blocks: [{ id: 't', type: 'text', text: 'deep [[Beta]]' }],
            },
          ],
        },
      ]),
    );

    expect(result).toEqual(['Alpha', 'Beta']);
  });

  it('returns nothing when there are no links', () => {
    expect(planLinkTargets(plan([{ id: '1', type: 'text', text: 'plain' }]))).toEqual([]);
  });
});

describe('planPlainText', () => {
  it('gathers text from every block type, including tables and code', () => {
    const text = planPlainText(
      plan([
        { id: '1', type: 'heading', level: 2, text: 'Title' },
        { id: '2', type: 'code', language: 'ts', code: 'const a = 1;' },
        { id: '3', type: 'table', columns: ['Col'], rows: [['Cell']] },
        { id: '4', type: 'divider' },
      ]),
    );

    expect(text).toContain('Title');
    expect(text).toContain('const a = 1;');
    expect(text).toContain('Col');
    expect(text).toContain('Cell');
  });

  it('includes nested section content', () => {
    const text = planPlainText(
      plan([
        {
          id: 'g',
          type: 'group',
          title: 'Outer',
          collapsed: false,
          blocks: [{ id: 't', type: 'text', text: 'Inner' }],
        },
      ]),
    );

    expect(text).toContain('Outer');
    expect(text).toContain('Inner');
  });
});
