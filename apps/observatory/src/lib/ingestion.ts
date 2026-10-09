import { Page, type ResearchEvent, type SourceService } from "@prototype/research-feed";

export type CursorState = { cursor: string | null; generation: number };
export interface IngestStore {
  cursor(source: SourceService): Promise<CursorState>;
  commit(source: SourceService, expected: CursorState, events: ResearchEvent[], next: string | null): Promise<{ committed: boolean; inserted: number }>;
}
export async function pullSource(input: { source: SourceService; url: string; key: string; store: IngestStore; fetcher?: typeof fetch; maxPages?: number }) {
  const fetcher = input.fetcher ?? fetch;
  let inserted = 0, pages = 0;
  for (; pages < (input.maxPages ?? 50); pages++) {
    const cursor = await input.store.cursor(input.source);
    const url = new URL(input.url);
    if (cursor.cursor) url.searchParams.set("cursor", cursor.cursor);
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${input.key}` }, signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!response.ok) throw new Error("SOURCE_UNAVAILABLE");
    const page = Page.parse(await response.json());
    if (page.source_service !== input.source || page.events.some(e => e.source_service !== input.source)) throw new Error("SOURCE_MISMATCH");
    if (page.next_cursor && page.next_cursor === cursor.cursor) throw new Error("NON_ADVANCING_CURSOR");
    const result = await input.store.commit(input.source, cursor, page.events, page.next_cursor);
    if (!result.committed) return { inserted, pages, concurrent: true, complete: false };
    inserted += result.inserted;
    if (!page.next_cursor) return { inserted, pages: pages + 1, concurrent: false, complete: true };
  }
  return { inserted, pages, concurrent: false, complete: false };
}
