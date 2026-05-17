import {
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BusinessContactRecord,
  BusinessWithEnrichment,
  PrismaService,
  SearchSnapshotRecord,
} from '../../prisma/prisma.service';
import {
  EmailAssessment,
  EmailQualityService,
} from '../../scraper/email-quality.service';
import { EnrichmentQueue } from '../../queue/enrichment.queue';
import { MapsQueue } from '../../queue/maps.queue';

interface LeadsResponse {
  status: 'ready' | 'processing';
  data: unknown[];
  message?: string;
  jobId?: string;
  partial?: boolean;
  limit: number;
  query: string;
  city: string;
}

interface LeadFilters {
  hasEmail?: boolean;
  hasContacts?: boolean;
  minLeadScore?: number;
  refreshStale?: boolean;
  highQualityOnly?: boolean;
}

@Injectable()
export class LeadsService {
  private readonly staleEnrichmentMs = 1000 * 60 * 60 * 24 * 14;
  private readonly searchFreshnessMs = 1000 * 60 * 60 * 24 * 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mapsQueue: MapsQueue,
    private readonly enrichmentQueue: EnrichmentQueue,
    private readonly emailQualityService: EmailQualityService,
  ) {}

  async getLeads(
    userId: number | undefined,
    query: string,
    city: string,
    limit: number,
    filters: LeadFilters = {},
  ): Promise<LeadsResponse> {
    if (!userId) {
      throw new UnauthorizedException('User context missing');
    }

    const user = await this.prisma.refreshUserLeadPeriod(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.subscriptionStatus === 'canceled') {
      throw new HttpException('Subscription is canceled', 403);
    }

    const leadsLimit = user.plan?.leadsLimit ?? null;
    if (leadsLimit !== null && user.leadsUsedThisPeriod >= leadsLimit) {
      throw new HttpException(
        `Lead limit reached for ${user.plan?.name ?? 'current'} plan (${leadsLimit} leads this billing period).`,
        429,
      );
    }

    await this.prisma.incrementSearchSnapshotCount(query, city);
    const snapshot = await this.prisma.findSearchSnapshot(query, city);

    const candidateLimit = Math.max(limit, Math.min(limit * 3, 300));
    const businesses = await this.prisma.findBusinessesByQueryCity(
      query,
      city,
      candidateLimit,
    );

    if (businesses.length > 0) {
      if (filters.refreshStale !== false) {
        await this.queueStaleEnrichmentRefreshes(businesses);
      }

      const rankedBusinesses = businesses
        .map((business) => this.toLeadResult(business))
        .filter((business) => this.matchesFilters(business, filters))
        .sort((a, b) => b.leadScore - a.leadScore)
        .slice(0, limit);

      const newlyDeliveredCount = await this.prisma.recordLeadDeliveries(
        user.id,
        rankedBusinesses.map((business) => business.id),
      );

      await this.prisma.incrementUserLeads(user.id, newlyDeliveredCount);

      const hasPartialCache = rankedBusinesses.length < limit;
      const cacheTrusted = this.isCacheTrusted(snapshot, limit);
      const shouldScrape = !cacheTrusted && hasPartialCache;
      const jobId = shouldScrape
        ? await this.ensureScrapeEnqueued(query, city, limit, snapshot)
        : undefined;

      return {
        status: 'ready',
        data: rankedBusinesses,
        message: shouldScrape
          ? `Returned ${rankedBusinesses.length} cached leads and started a background scrape to fill the remaining ${limit - rankedBusinesses.length}.`
          : undefined,
        jobId,
        partial: hasPartialCache || undefined,
        limit,
        query,
        city,
      };
    }

    const jobId = await this.ensureScrapeEnqueued(query, city, limit, snapshot);
    return {
      status: 'processing',
      message:
        'No cached leads yet. Scraping has started in the background. Retry shortly.',
      data: [],
      jobId,
      partial: false,
      limit,
      query,
      city,
    };
  }

  private isCacheTrusted(
    snapshot: SearchSnapshotRecord | null,
    currentLimit: number,
  ): boolean {
    if (!snapshot || !snapshot.lastScrapedAt) {
      return false;
    }
    const age = Date.now() - new Date(snapshot.lastScrapedAt).getTime();
    if (age > this.searchFreshnessMs) {
      return false;
    }
    return snapshot.lastRequestedLimit >= currentLimit;
  }

  private async ensureScrapeEnqueued(
    query: string,
    city: string,
    limit: number,
    snapshot: SearchSnapshotRecord | null,
  ): Promise<string> {
    if (snapshot?.lastScrapeJobId && snapshot.lastRequestedLimit >= limit) {
      const run = await this.prisma.findJobRunByJobId(snapshot.lastScrapeJobId);
      if (run && run.status === 'running') {
        return snapshot.lastScrapeJobId;
      }
    }

    const jobId = await this.mapsQueue.enqueueScrape({ query, city, limit });
    await this.prisma.markSearchSnapshotEnqueued({
      query,
      city,
      jobId,
      requestedLimit: limit,
    });
    return jobId;
  }

  private async queueStaleEnrichmentRefreshes(
    businesses: BusinessWithEnrichment[],
  ): Promise<void> {
    for (const business of businesses) {
      const enrichmentTarget =
        business.website ??
        business.enrichment?.linkedin ??
        business.enrichment?.facebook ??
        business.enrichment?.instagram ??
        null;

      if (!enrichmentTarget) {
        continue;
      }

      const lastChecked = business.enrichment?.lastChecked ?? null;
      const isStale =
        !lastChecked ||
        Date.now() - new Date(lastChecked).getTime() > this.staleEnrichmentMs;

      if (!isStale) {
        continue;
      }

      await this.enrichmentQueue.enqueueEnrichment({
        businessId: business.id,
        website: enrichmentTarget,
      });
    }
  }

  private toLeadResult(business: BusinessWithEnrichment): {
    id: number;
    name: string;
    phone: string | null;
    website: string | null;
    city: string;
    category: string;
    rating: number | null;
    reviews: number | null;
    googleMapsUrl: string | null;
    scrapedAt: Date;
    leadScore: number;
    contactCount: number;
    hasBusinessEmail: boolean;
    hasHighQualityContact: boolean;
    freshness: 'fresh' | 'stale' | 'missing';
    enrichment: {
      emails: EmailAssessment[];
      instagram: string | null;
      facebook: string | null;
      linkedin: string | null;
      lastChecked: Date | null;
      topContacts: Array<{
        name: string | null;
        title: string | null;
        email: string | null;
        emailQuality: EmailAssessment | null;
        phone: string | null;
        linkedin: string | null;
        sourceUrl: string;
        sourcePage: string | null;
        emailType: string | null;
        roleCategory: string | null;
        domainMatches: boolean;
        confidence: number;
      }>;
    } | null;
  } {
    const usableEmails = this.getUsableEmailAssessments(
      business.enrichment?.emails ?? [],
      business.website,
    );
    const sortedContacts = this.dedupeLeadContacts(
      business.contacts
        .map((contact) => this.toLeadContact(contact, business.website))
        .filter(
          (contact): contact is NonNullable<typeof contact> => contact !== null,
        )
        .sort((a, b) => b.confidence - a.confidence),
    );
    const hasBusinessEmail =
      usableEmails.length > 0 ||
      sortedContacts.some((contact) => Boolean(contact.email));
    const topContacts = sortedContacts.slice(0, 5).map((contact) => ({
      name: contact.name,
      title: contact.title,
      email: contact.email,
      emailQuality: contact.emailQuality,
      phone: contact.phone,
      linkedin: contact.linkedin,
      sourceUrl: contact.sourceUrl,
      sourcePage: contact.sourcePage,
      emailType: contact.emailType,
      roleCategory: contact.roleCategory,
      domainMatches: contact.domainMatches,
      confidence: contact.confidence,
    }));

    return {
      id: business.id,
      name: business.name,
      phone: business.phone,
      website: business.website,
      city: business.city,
      category: business.category,
      rating: business.rating,
      reviews: business.reviews,
      googleMapsUrl: business.googleMapsUrl,
      scrapedAt: business.scrapedAt,
      leadScore: this.calculateLeadScore(
        business,
        sortedContacts,
        usableEmails,
      ),
      contactCount: sortedContacts.length,
      hasBusinessEmail,
      hasHighQualityContact:
        usableEmails.some((email) => email.quality === 'high') ||
        sortedContacts.some(
          (contact) => contact.emailQuality?.quality === 'high',
        ),
      freshness: this.getFreshness(business),
      enrichment: business.enrichment
        ? {
            emails: usableEmails,
            instagram: business.enrichment.instagram,
            facebook: business.enrichment.facebook,
            linkedin: business.enrichment.linkedin,
            lastChecked: business.enrichment.lastChecked,
            topContacts,
          }
        : topContacts.length > 0
          ? {
              emails: [],
              instagram: null,
              facebook: null,
              linkedin: null,
              lastChecked: null,
              topContacts,
            }
          : null,
    };
  }

  private calculateLeadScore(
    business: BusinessWithEnrichment,
    contacts: Array<
      BusinessContactRecord & { emailQuality: EmailAssessment | null }
    >,
    emails: EmailAssessment[],
  ): number {
    let score = 0;

    if (business.website) {
      score += 10;
    }

    if (business.phone) {
      score += 8;
    }

    if (business.rating && business.rating >= 4) {
      score += 8;
    }

    if (business.reviews && business.reviews >= 10) {
      score += 8;
    }

    if (emails.length > 0) {
      score += 12;
      score += emails.some((email) => email.quality === 'high') ? 10 : 4;
    }

    if (contacts.length > 0) {
      score += 20;
      score += Math.min(contacts[0]?.confidence ?? 0, 20);
      score += contacts.some(
        (contact) => contact.emailQuality?.quality === 'high',
      )
        ? 8
        : 0;
    }

    if (
      business.enrichment?.linkedin ||
      business.enrichment?.facebook ||
      business.enrichment?.instagram
    ) {
      score += 8;
    }

    if (this.getFreshness(business) === 'fresh') {
      score += 6;
    }

    return Math.max(0, Math.min(score, 100));
  }

  private getFreshness(
    business: BusinessWithEnrichment,
  ): 'fresh' | 'stale' | 'missing' {
    const lastChecked = business.enrichment?.lastChecked;
    if (!lastChecked) {
      return 'missing';
    }

    return Date.now() - new Date(lastChecked).getTime() > this.staleEnrichmentMs
      ? 'stale'
      : 'fresh';
  }

  private matchesFilters(
    business: {
      leadScore: number;
      contactCount: number;
      hasBusinessEmail: boolean;
      hasHighQualityContact?: boolean;
    },
    filters: LeadFilters,
  ): boolean {
    if (filters.hasEmail && !business.hasBusinessEmail) {
      return false;
    }

    if (filters.hasContacts && business.contactCount === 0) {
      return false;
    }

    if (
      typeof filters.minLeadScore === 'number' &&
      business.leadScore < filters.minLeadScore
    ) {
      return false;
    }

    if (filters.highQualityOnly && !business.hasHighQualityContact) {
      return false;
    }

    return true;
  }

  private getUsableEmailAssessments(
    emails: string[],
    businessWebsite: string | null,
  ): EmailAssessment[] {
    return [...new Set(emails)]
      .map((email) => this.emailQualityService.assess(email, businessWebsite))
      .filter((assessment) => !assessment.suppressed)
      .sort((a, b) => b.score - a.score);
  }

  private toLeadContact(
    contact: BusinessContactRecord,
    businessWebsite: string | null,
  ): (BusinessContactRecord & { emailQuality: EmailAssessment | null }) | null {
    const emailQuality = contact.email
      ? this.emailQualityService.assess(contact.email, businessWebsite)
      : null;

    if (emailQuality?.suppressed && !contact.phone && !contact.linkedin) {
      return null;
    }

    return {
      ...contact,
      email: emailQuality?.suppressed ? null : contact.email,
      emailQuality,
      confidence: Math.max(
        0,
        Math.min(
          emailQuality && !emailQuality.suppressed
            ? Math.round((contact.confidence + emailQuality.score) / 2)
            : contact.confidence,
          100,
        ),
      ),
    };
  }

  private dedupeLeadContacts(
    contacts: Array<
      BusinessContactRecord & { emailQuality: EmailAssessment | null }
    >,
  ): Array<BusinessContactRecord & { emailQuality: EmailAssessment | null }> {
    const deduped = new Map<
      string,
      BusinessContactRecord & { emailQuality: EmailAssessment | null }
    >();

    for (const contact of contacts) {
      const key = this.buildLeadContactKey(contact);
      const existing = deduped.get(key);

      if (!existing || this.isBetterLeadContact(contact, existing)) {
        deduped.set(key, contact);
      }
    }

    return [...deduped.values()].sort((a, b) => b.confidence - a.confidence);
  }

  private buildLeadContactKey(
    contact: BusinessContactRecord & { emailQuality: EmailAssessment | null },
  ): string {
    const normalizedEmail = contact.email?.trim().toLowerCase();
    if (normalizedEmail) {
      return `email:${normalizedEmail}`;
    }

    const normalizedLinkedin = contact.linkedin?.trim().toLowerCase();
    if (normalizedLinkedin) {
      return `linkedin:${normalizedLinkedin}`;
    }

    const normalizedName = contact.name
      ?.trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    const normalizedPhone = contact.phone?.replace(/\D/g, '');

    if (normalizedName && normalizedPhone) {
      return `name-phone:${normalizedName}:${normalizedPhone}`;
    }

    if (normalizedName) {
      return `name:${normalizedName}`;
    }

    if (normalizedPhone) {
      return `phone:${normalizedPhone}`;
    }

    return `source:${contact.sourceUrl}`;
  }

  private isBetterLeadContact(
    candidate: BusinessContactRecord & { emailQuality: EmailAssessment | null },
    current: BusinessContactRecord & { emailQuality: EmailAssessment | null },
  ): boolean {
    if (candidate.confidence !== current.confidence) {
      return candidate.confidence > current.confidence;
    }

    const candidateQuality = candidate.emailQuality?.score ?? -1;
    const currentQuality = current.emailQuality?.score ?? -1;
    if (candidateQuality !== currentQuality) {
      return candidateQuality > currentQuality;
    }

    const candidateFields = [
      candidate.name,
      candidate.title,
      candidate.email,
      candidate.phone,
      candidate.linkedin,
    ].filter(Boolean).length;
    const currentFields = [
      current.name,
      current.title,
      current.email,
      current.phone,
      current.linkedin,
    ].filter(Boolean).length;

    return candidateFields > currentFields;
  }
}
