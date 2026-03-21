import { EmailQualityService } from './email-quality.service';

describe('EmailQualityService', () => {
  let service: EmailQualityService;

  beforeEach(() => {
    service = new EmailQualityService();
  });

  it('marks business-domain person emails as high quality', () => {
    const result = service.assess('jane.doe@acme.com', 'https://acme.com');

    expect(result.suppressed).toBe(false);
    expect(result.quality).toBe('high');
    expect(result.reasons).toContain('domain-match');
  });

  it('suppresses obvious noreply mailboxes', () => {
    const result = service.assess('noreply@acme.com', 'https://acme.com');

    expect(result.suppressed).toBe(true);
    expect(result.quality).toBe('suppressed');
  });

  it('suppresses disposable domains', () => {
    const result = service.assess('lead@mailinator.com', 'https://acme.com');

    expect(result.suppressed).toBe(true);
    expect(result.reasons).toContain('disposable-domain');
  });
});
