import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DatePicker } from './date-picker';
import { shiftISODate, todayISO } from '../../shared/week';

describe('DatePicker', () => {
  let fixture: ComponentFixture<DatePicker>;
  let host: HTMLElement;
  let picked: (string | null)[];

  async function create(value: string | null, extra: Record<string, unknown> = {}) {
    await TestBed.configureTestingModule({ imports: [DatePicker] }).compileComponents();
    fixture = TestBed.createComponent(DatePicker);
    fixture.componentRef.setInput('value', value);
    for (const [key, v] of Object.entries(extra)) fixture.componentRef.setInput(key, v);
    picked = [];
    fixture.componentInstance.picked.subscribe((iso) => picked.push(iso));
    host = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const day = (iso: string) => host.querySelector<HTMLButtonElement>(`[data-iso="${iso}"]`);
  const title = () => host.querySelector('.date-head__title')!.textContent!.trim();

  it('opens on the month of the set date and marks it', async () => {
    await create('2027-03-18');
    expect(title()).toBe('March 2027');
    expect(day('2027-03-18')!.classList).toContain('is-selected');
    expect(day('2027-03-18')!.tabIndex).toBe(0);
  });

  it('opens on the current month without a date', async () => {
    await create(null);
    expect(day(todayISO())!.classList).toContain('is-today');
    expect(host.querySelector('.date-clear')).toBeNull();
  });

  it('emits the tapped day', async () => {
    await create(null);
    day(todayISO())!.click();
    expect(picked).toEqual([todayISO()]);
  });

  it('emits a quick choice and null for "Remove date"', async () => {
    await create('2027-03-18');
    host.querySelector<HTMLButtonElement>('.date-preset')!.click();
    host.querySelector<HTMLButtonElement>('.date-clear')!.click();
    expect(picked).toEqual([todayISO(), null]);
  });

  it('pages months with the arrows', async () => {
    await create('2026-12-10');
    host.querySelector<HTMLButtonElement>('[aria-label="Next month"]')!.click();
    fixture.detectChanges();
    expect(title()).toBe('January 2027');
    expect(day('2027-01-10')!.tabIndex).toBe(0);
  });

  it('moves by keyboard and picks the logical focus on Enter', async () => {
    await create('2026-11-30');
    const grid = host.querySelector<HTMLElement>('.date-grid')!;
    const key = (k: string) => grid.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

    key('ArrowRight'); // 1 December: next month
    fixture.detectChanges();
    expect(title()).toBe('December 2026');
    key('ArrowDown');
    key('Enter');
    expect(picked).toEqual([shiftISODate('2026-12-01', 7)]);
  });

  it('keeps arrow keys from reaching the page', async () => {
    await create('2026-11-12');
    const seen: string[] = [];
    const listener = (e: KeyboardEvent) => seen.push(e.key);
    document.addEventListener('keydown', listener);
    host.querySelector<HTMLElement>('.date-grid')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    document.removeEventListener('keydown', listener);
    expect(seen).toEqual([]);
  });

  it('can hide the quick choices', async () => {
    await create(null, { presets: false });
    expect(host.querySelector('.date-preset')).toBeNull();
  });
});
