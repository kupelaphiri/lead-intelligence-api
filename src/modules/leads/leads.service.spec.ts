import { LeadsService } from './leads.service';

describe('LeadsService', () => {
  const prisma = {
    findUserById: jest.fn(),
    findBusinessesByQueryCity: jest.fn(),
    recordLeadDeliveries: jest.fn(),
    incrementUserLeads: jest.fn(),
  };
  const mapsQueue = {
    enqueueScrape: jest.fn(),
  };
  const enrichmentQueue = {
    enqueueEnrichment: jest.fn(),
  };
  const emailQualityService = {
    assess: jest.fn(),
  };

  let service: LeadsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LeadsService(
      prisma as never,
      mapsQueue as never,
      enrichmentQueue as never,
      emailQualityService as never,
    );

    prisma.findUserById.mockResolvedValue({
      id: 7,
      subscriptionStatus: 'active',
      leadsCollected: 0,
      plan: { name: 'Starter', leadsLimit: 1000 },
    });
    prisma.recordLeadDeliveries.mockResolvedValue(1);
    prisma.incrementUserLeads.mockResolvedValue(undefined);
    enrichmentQueue.enqueueEnrichment.mockResolvedValue(undefined);
    emailQualityService.assess.mockImplementation((email: string) => ({
      email,
      score: email.includes('acme.com') ? 80 : 40,
      quality: email.includes('acme.com') ? 'high' : 'low',
      suppressed: email.startsWith('noreply'),
      reasons: [],
    }));
  });

  it('returns only high-quality leads when requested', async () => {
    prisma.findBusinessesByQueryCity.mockResolvedValue([
      {
        id: 1,
        name: 'Acme Dental',
        phone: '123',
        website: 'https://acme.com',
        city: 'Johannesburg',
        category: 'dentists',
        rating: 4.7,
        reviews: 43,
        googleMapsUrl: null,
        scrapedAt: new Date('2026-03-20T00:00:00.000Z'),
        enrichment: {
          emails: ['jane@acme.com'],
          instagram: null,
          facebook: null,
          linkedin: null,
          lastChecked: new Date(),
        },
        contacts: [],
      },
      {
        id: 2,
        name: 'Budget Dental',
        phone: null,
        website: 'https://budget.example',
        city: 'Johannesburg',
        category: 'dentists',
        rating: 3.8,
        reviews: 2,
        googleMapsUrl: null,
        scrapedAt: new Date('2026-03-20T00:00:00.000Z'),
        enrichment: {
          emails: ['info@gmail.com'],
          instagram: null,
          facebook: null,
          linkedin: null,
          lastChecked: new Date(),
        },
        contacts: [],
      },
    ]);

    const result = await service.getLeads(7, 'dentists', 'Johannesburg', 10, {
      highQualityOnly: true,
    });

    expect(result.status).toBe('ready');
    expect(result.data).toHaveLength(1);
    expect((result.data as Array<{ id: number }>)[0]?.id).toBe(1);
  });

  it('queues scraping when no cached businesses exist', async () => {
    prisma.findBusinessesByQueryCity.mockResolvedValue([]);
    mapsQueue.enqueueScrape.mockResolvedValue('dentists-job');

    const result = await service.getLeads(7, 'dentists', 'Johannesburg', 10);

    expect(result.status).toBe('processing');
    expect(result.jobId).toBe('dentists-job');
    expect(mapsQueue.enqueueScrape).toHaveBeenCalledWith({
      query: 'dentists',
      city: 'Johannesburg',
      limit: 10,
    });
  });
});
