export interface MapsScrapeJobPayload {
  query: string;
  city: string;
  limit: number;
}

export interface EnrichmentJobPayload {
  businessId: number;
  website: string;
}
