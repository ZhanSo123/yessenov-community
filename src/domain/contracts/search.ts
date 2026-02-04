export type SearchDocument = {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
};

export type SearchQuery = {
  term: string;
  limit?: number;
};

export type SearchResult = {
  hits: SearchDocument[];
  total: number;
};

export interface SearchIndex {
  upsert(documents: SearchDocument[]): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult>;
}
