import { ConfirmService } from './confirm.service';

describe('ConfirmService', () => {
  const ask = (service: ConfirmService) =>
    service.ask({ title: 'Delete this todo?', message: '“Buy milk” will be deleted.', confirmLabel: 'Delete' });

  it('shows the question until it is answered', async () => {
    const service = new ConfirmService();
    const answer = ask(service);
    expect(service.current()?.title).toBe('Delete this todo?');
    service.answer(true);
    expect(service.current()).toBeNull();
    await expect(answer).resolves.toBe(true);
  });

  it('reports a cancel as false', async () => {
    const service = new ConfirmService();
    const answer = ask(service);
    service.answer(false);
    await expect(answer).resolves.toBe(false);
  });

  it('declines the open question when a second one comes', async () => {
    const service = new ConfirmService();
    const first = ask(service);
    const second = ask(service);
    await expect(first).resolves.toBe(false);
    service.answer(true);
    await expect(second).resolves.toBe(true);
  });

  it('grows from the centre when no button asked', () => {
    const service = new ConfirmService();
    ask(service);
    expect(service.current()?.origin).toEqual({ x: 0, y: 0 });
  });

  it('remembers where the asking button sits', () => {
    const service = new ConfirmService();
    const button = document.createElement('button');
    button.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 20, height: 10, right: 30, bottom: 30, x: 10, y: 20, toJSON: () => ({}) }) as DOMRect;
    service.ask({ title: 't', message: 'm', confirmLabel: 'ok', from: button });
    expect(service.current()?.origin).toEqual({
      x: Math.round(20 - window.innerWidth / 2),
      y: Math.round(25 - window.innerHeight / 2),
    });
  });
});
