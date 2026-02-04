import type { SearchDocument, SearchIndex, SearchQuery, SearchResult } from "@/domain/contracts";

export class InMemorySearchIndex implements SearchIndex {
  private docs = new Map<string, SearchDocument>();

  async upsert(documents: SearchDocument[]): Promise<void> {
    documents.forEach((doc) => {
      this.docs.set(doc.id, doc);
    });
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const term = query.term.trim().toLowerCase();
    if (!term) {
      return { hits: [], total: 0 };
    }
    const limit = query.limit ?? 20;
    const hits = Array.from(this.docs.values()).filter((doc) =>
      doc.text.toLowerCase().includes(term)
    );
    return { hits: hits.slice(0, limit), total: hits.length };
  }
}
