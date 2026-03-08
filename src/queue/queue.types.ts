export interface MapsScrapeJobPayload {
  query: string;
  city: string;
}

export interface EnrichmentJobPayload {
  businessId: number;
  website: string;
}
