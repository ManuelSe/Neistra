import type { Entry, StructureType } from "../api/types";

export interface BrowserFilters {
  readonly search: string;
  readonly type: StructureType | "all";
}
export interface BrowserFilterScope {
  readonly projectId: string | null;
  readonly visit: object;
}
export type BrowserFilterPatch = Partial<BrowserFilters>;
export const emptyBrowserFilters: BrowserFilters = Object.freeze({ search: "", type: "all" });

/** Existing entry-list semantics; display visibility and group collapse are separate. */
export function matchesBrowserFilters(entry: Pick<Entry, "name" | "original_filename" | "structure_type">, filters: BrowserFilters): boolean {
  const query = filters.search.trim().toLocaleLowerCase();
  return (filters.type === "all" || entry.structure_type === filters.type)
    && (!query || entry.name.toLocaleLowerCase().includes(query)
      || Boolean(entry.original_filename?.toLocaleLowerCase().includes(query)));
}
