import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/enviroment';
import { PlanTitleService } from './plan-title.service';
import { PlanTranslateService, TranslateError } from './plan-translate.service';

const url = `${environment.apiUrl}/plan/translate`;
const text = (value: string) => ({ text: value, kind: 'text' as const });

describe('PlanTranslateService', () => {
  let service: PlanTranslateService;
  let titles: PlanTitleService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlanTranslateService);
    titles = TestBed.inject(PlanTitleService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the texts with the target language and books one unit', async () => {
    titles.remaining.set(5);
    const done = service.translate([text('Ziele'), text('Budget')], 'en');

    const req = http.expectOne(url);
    expect(req.request.body).toEqual({ target: 'en', items: [text('Ziele'), text('Budget')] });
    req.flush({ translations: ['Goals', 'Budget'] });

    expect(await done).toEqual(['Goals', 'Budget']);
    expect(titles.remaining()).toBe(4);
  });

  it('splits a long plan and puts the answers back in order', async () => {
    const long = 'a'.repeat(6000);
    const done = service.translate([text(long), text(long), text('kurz')], 'en');

    const [first, second] = http.match(url);
    // Die zweite Antwort kommt zuerst — die Reihenfolge darf daran nicht hängen.
    second.flush({ translations: ['B', 'short'] });
    first.flush({ translations: ['A'] });

    expect(await done).toEqual(['A', 'B', 'short']);
  });

  it('says why when the daily limit is reached, and remembers it', async () => {
    const done = service.translate([text('Ziele')], 'en');
    http.expectOne(url).flush('limit', { status: 429, statusText: 'Too Many Requests' });

    await expect(done).rejects.toThrow(new TranslateError('Daily AI limit reached — try again tomorrow'));
    expect(titles.remaining()).toBe(0);
  });

  it('passes on the reason the server gives when the model delivered nothing', async () => {
    const done = service.translate([text('Ziele')], 'en');
    http.expectOne(url).flush({ translations: null, error: 'The model declined to translate this plan' });

    await expect(done).rejects.toThrow('The model declined to translate this plan');
  });

  it('does not start when the plan needs more requests than are left today', async () => {
    titles.remaining.set(1);
    const long = 'a'.repeat(6000);

    await expect(service.translate([text(long), text(long)], 'de')).rejects.toThrow(
      'This plan needs 2 AI requests, 1 left today',
    );
    http.expectNone(url);
  });
});
