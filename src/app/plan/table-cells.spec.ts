import { describe, expect, it } from 'vitest';

import { cellChip } from './table-cells';

describe('cellChip', () => {
  it('shows an HTTP method as a coloured mark, however it was typed', () => {
    expect(cellChip('GET')).toBe('<span class="cell-chip cell-method cell-method--get">GET</span>');
    expect(cellChip(' delete ')).toBe('<span class="cell-chip cell-method cell-method--delete">DELETE</span>');
  });

  it('colours an HTTP status by its class', () => {
    expect(cellChip('201')).toBe('<span class="cell-chip cell-method cell-status--2xx">201</span>');
    expect(cellChip('404')).toContain('cell-status--4xx');
    expect(cellChip('503')).toContain('cell-status--5xx');
    expect(cellChip('2024')).toBeNull();
    expect(cellChip('600')).toBeNull();
  });

  it('shows a level as a mark with a dot, in the words it was written in', () => {
    expect(cellChip('High')).toContain('cell-level--high');
    expect(cellChip('High')).toContain('>High</span>');
    expect(cellChip('mittel')).toContain('cell-level--medium');
    expect(cellChip('Low')).toContain('cell-level--low');
    expect(cellChip('Critical')).toContain('cell-level--high');
  });

  it('sets a path in code', () => {
    expect(cellChip('/orders/:id')).toBe('<code class="cell-path">/orders/:id</code>');
    expect(cellChip('/users/{id}/orders')).toBe('<code class="cell-path">/users/{id}/orders</code>');
  });

  it('leaves everything else to the text formatter', () => {
    expect(cellChip('GET the list')).toBeNull();
    expect(cellChip('Highly unlikely')).toBeNull();
    expect(cellChip('')).toBeNull();
    expect(cellChip('/')).toBe('<code class="cell-path">/</code>');
    expect(cellChip('a/b')).toBeNull();
  });

  it('never lets markup through a path', () => {
    expect(cellChip('/<img src=x onerror=alert(1)>')).toBeNull();
    expect(cellChip('/a"b')).toBeNull();
    expect(cellChip("/a'b")).toBeNull();
    expect(cellChip('/a&b')).toBeNull();
  });
});
