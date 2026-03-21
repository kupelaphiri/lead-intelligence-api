import { PrismaClient } from '@prisma/client';

type SocialPlatform = 'instagram' | 'facebook' | 'linkedin';

const prisma = new PrismaClient();

const platformDomains: Record<SocialPlatform, string[]> = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  linkedin: ['linkedin.com'],
};

async function main(): Promise<void> {
  const businesses = await prisma.business.findMany({
    where: {
      OR: buildWebsiteFilters(),
    },
    include: {
      enrichment: true,
    },
    orderBy: {
      id: 'asc',
    },
  });

  if (businesses.length === 0) {
    console.log(
      'No businesses with social profile URLs in website were found.',
    );
    return;
  }

  let cleanedBusinesses = 0;
  let updatedEnrichments = 0;

  for (const business of businesses) {
    const website = normalizeUrl(business.website);
    if (!website) {
      continue;
    }

    const platform = detectPlatform(website);
    if (!platform) {
      continue;
    }

    const nextSocialValue = business.enrichment?.[platform] ?? website;

    await prisma.$transaction([
      prisma.business.update({
        where: { id: business.id },
        data: { website: null },
      }),
      prisma.enrichment.upsert({
        where: { businessId: business.id },
        create: {
          businessId: business.id,
          emails: [],
          instagram: platform === 'instagram' ? nextSocialValue : null,
          facebook: platform === 'facebook' ? nextSocialValue : null,
          linkedin: platform === 'linkedin' ? nextSocialValue : null,
        },
        update: {
          instagram:
            platform === 'instagram'
              ? nextSocialValue
              : (business.enrichment?.instagram ?? undefined),
          facebook:
            platform === 'facebook'
              ? nextSocialValue
              : (business.enrichment?.facebook ?? undefined),
          linkedin:
            platform === 'linkedin'
              ? nextSocialValue
              : (business.enrichment?.linkedin ?? undefined),
        },
      }),
    ]);

    cleanedBusinesses += 1;

    if (!business.enrichment?.[platform]) {
      updatedEnrichments += 1;
    }

    console.log(
      `Cleaned business ${business.id} (${business.name}): moved ${platform} URL out of website`,
    );
  }

  console.log(
    `Cleanup complete. Cleared ${cleanedBusinesses} business website fields and populated ${updatedEnrichments} enrichment social fields.`,
  );
}

function buildWebsiteFilters(): Array<{
  website: { contains: string; mode: 'insensitive' };
}> {
  return Object.values(platformDomains)
    .flat()
    .map((domain) => ({
      website: {
        contains: domain,
        mode: 'insensitive' as const,
      },
    }));
}

function normalizeUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(
      trimmed.startsWith('http') ? trimmed : `https://${trimmed}`,
    );
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function detectPlatform(url: string): SocialPlatform | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    for (const [platform, domains] of Object.entries(platformDomains) as Array<
      [SocialPlatform, string[]]
    >) {
      if (
        domains.some(
          (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
        )
      ) {
        return platform;
      }
    }

    return null;
  } catch {
    return null;
  }
}

main()
  .catch((error: unknown) => {
    console.error('Failed to clean social website values:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
