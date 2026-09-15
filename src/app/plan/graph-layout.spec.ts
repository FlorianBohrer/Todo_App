import { layoutGraph } from './graph-layout';

const WIDTH = 600;
const HEIGHT = 400;

describe('layoutGraph', () => {
  it('returns nothing for an empty graph', () => {
    expect(layoutGraph([], [], WIDTH, HEIGHT)).toEqual({ nodes: [], edges: [] });
  });

  it('centres a single node', () => {
    const { nodes } = layoutGraph([{ id: 'a', label: 'A' }], [], WIDTH, HEIGHT);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].x).toBe(WIDTH / 2);
    expect(nodes[0].y).toBe(HEIGHT / 2);
  });

  it('is deterministic, so the same notes always look the same', () => {
    const nodes = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ];
    const edges = [{ source: 'a', target: 'b' }];

    const first = layoutGraph(nodes, edges, WIDTH, HEIGHT);
    const second = layoutGraph(nodes, edges, WIDTH, HEIGHT);

    expect(first).toEqual(second);
  });

  it('keeps every node inside the canvas', () => {
    const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, label: `N${i}` }));
    const edges = [
      { source: 'n0', target: 'n1' },
      { source: 'n1', target: 'n2' },
      { source: 'n5', target: 'n9' },
    ];

    const { nodes: placed } = layoutGraph(nodes, edges, WIDTH, HEIGHT);

    for (const node of placed) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(WIDTH);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(HEIGHT);
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it('preserves every node and its payload', () => {
    const { nodes } = layoutGraph(
      [
        { id: 'a', label: 'Alpha', tone: 'text-rose-300' },
        { id: 'b', label: 'Beta' },
      ],
      [],
      WIDTH,
      HEIGHT,
    );

    expect(nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(nodes[0].label).toBe('Alpha');
    expect(nodes[0].tone).toBe('text-rose-300');
  });

  it('counts connections per node', () => {
    const { nodes } = layoutGraph(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
      [
        { source: 'a', target: 'b' },
        { source: 'a', target: 'c' },
      ],
      WIDTH,
      HEIGHT,
    );

    const degrees = Object.fromEntries(nodes.map((n) => [n.id, n.degree]));
    expect(degrees).toEqual({ a: 2, b: 1, c: 1 });
  });

  it('drops edges pointing at unknown notes, which would skew the forces', () => {
    const { edges } = layoutGraph(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      [
        { source: 'a', target: 'b' },
        { source: 'a', target: 'ghost' },
        { source: 'a', target: 'a' },
      ],
      WIDTH,
      HEIGHT,
    );

    expect(edges).toEqual([{ source: 'a', target: 'b' }]);
  });
});
