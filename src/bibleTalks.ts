// Client for the public Christadelphian Bible Talks catalog
// (https://christadelphianbibletalks.com). No dependencies: it only needs a
// global `fetch`, so it runs in browsers, Node 18+, Deno, Bun and
// Cloudflare Workers.

export interface Study {
  id: number;
  title: string;
  speaker: string;
  location: string;
  year: string;
  description: string;
  posted: number;
  date_entered: string;
  date_modified?: string;
  /** Unreliable: 0 for about a third of studies that do have classes. */
  num_classes: number;
  num_notes?: number;
  /** Always empty in list results; only `getStudy` fills it. */
  classes: Class[];
  notes: Note[];
  deleted?: number;
}

export interface Class {
  id: number;
  study_id: number;
  title: string;
  file_name: string;
  order: number;
  /** "mm:ss" or "h:mm:ss"; can be "" when unknown. */
  length: string;
  extension: string;
  /** e.g. "33.33 MB"; can be `false` when unknown. */
  size: string | false;
  deleted: number;
}

export interface Note {
  id: number;
  study_id: number;
  title: string;
  file_name: string;
  order: number;
  extension: string;
  size: string | false;
  deleted: number;
  date_entered: string;
  date_modified: string;
}

export type SortField = 'title' | 'speaker' | 'year' | 'date_entered';

export interface StudiesQuery {
  /** Substring match on the series title. */
  title?: string;
  /** Exact match on the raw speaker field (see speakers.ts for cleanup). */
  speaker?: string;
  yearFrom?: string;
  yearTo?: string;
  orderBy?: { field: SortField; direction: 'ASC' | 'DESC' }[];
  offset?: number;
  count?: number;
}

export interface ClientOptions {
  /** Defaults to the public v3.0 API. */
  apiBase?: string;
  /** Defaults to https://christadelphianbibletalks.com (where the audio lives). */
  fileBase?: string;
  /** How long responses are cached in memory. Defaults to 1 hour; 0 turns caching off. */
  cacheTtlMs?: number;
  /** Swap in your own fetch (for tests, proxies, or older runtimes). */
  fetch?: typeof fetch;
}

const DEFAULT_API_BASE = 'https://christadelphianbibletalks.com/api/v3_0';
const DEFAULT_FILE_BASE = 'https://christadelphianbibletalks.com';
// The whole catalog is under 2,000 studies; one request of this size gets all of it.
const ALL = 10000;

export class BibleTalksError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'BibleTalksError';
  }
}

export function createBibleTalksClient(options: ClientOptions = {}) {
  const apiBase = (options.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, '');
  const fileBase = (options.fileBase ?? DEFAULT_FILE_BASE).replace(/\/$/, '');
  const ttl = options.cacheTtlMs ?? 60 * 60 * 1000;
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));

  const cache = new Map<string, { data: unknown; expiresAt: number }>();
  // Two callers asking for the same URL at once share one request.
  const inFlight = new Map<string, Promise<unknown>>();

  /** GET a JSON URL. Returns null on 404, throws BibleTalksError on other failures. */
  async function getJson<T>(url: string): Promise<T | null> {
    const hit = cache.get(url);
    if (hit && hit.expiresAt > Date.now()) return hit.data as T;
    const pending = inFlight.get(url);
    if (pending) return pending as Promise<T | null>;

    const promise = (async () => {
      const res = await doFetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new BibleTalksError(`Upstream returned HTTP ${res.status} for ${url}`, res.status);
      const data = await res.json();
      if (ttl > 0) cache.set(url, { data, expiresAt: Date.now() + ttl });
      return data;
    })();
    inFlight.set(url, promise);
    try {
      return (await promise) as T | null;
    } finally {
      inFlight.delete(url);
    }
  }

  function studiesUrl(q: StudiesQuery): string {
    const p = new URLSearchParams();
    // Unposted studies are drafts on the upstream site; never show them.
    p.append('filter[0][posted]', '1');
    if (q.title) p.append('filter[1][title][$contains]', q.title);
    if (q.speaker) p.append('filter[2][speaker]', q.speaker);
    if (q.yearFrom) p.append('filter[3][year][$gte]', q.yearFrom);
    if (q.yearTo) p.append(`filter[${q.yearFrom ? 4 : 3}][year][$lte]`, q.yearTo);
    const order = q.orderBy?.length ? q.orderBy : [{ field: 'date_entered', direction: 'DESC' }];
    order.forEach((o, i) => p.append(`orderBy[${i}][${o.field}]`, o.direction));
    p.append('offset', String(q.offset ?? 0));
    p.append('count', String(q.count ?? ALL));
    return `${apiBase}/studies?${p}`;
  }

  /**
   * One page of posted studies (newest upload first by default). Each study's
   * `classes` is empty here; call getStudy for the playable files.
   */
  async function listStudies(query: StudiesQuery = {}): Promise<Study[]> {
    return (await getJson<Study[]>(studiesUrl(query))) ?? [];
  }

  /** IDs of studies with a live class whose title contains `text` (case-insensitive). */
  async function studyIdsByClassTitle(text: string): Promise<Set<number>> {
    const p = new URLSearchParams();
    p.append('filter[0][title][$contains]', text);
    p.append('count', String(ALL));
    const classes = (await getJson<Pick<Class, 'study_id' | 'deleted'>[]>(`${apiBase}/classes?${p}`)) ?? [];
    return new Set(classes.filter((c) => !c.deleted).map((c) => c.study_id));
  }

  /**
   * Like listStudies, but `title` also matches the titles of individual
   * classes, so "Mary & Martha" finds a series that only mentions them in
   * class 9. Order and year filters still apply; offset/count are applied
   * after merging.
   */
  async function searchStudies(query: StudiesQuery = {}): Promise<Study[]> {
    if (!query.title) return listStudies(query);
    const { offset = 0, count, ...rest } = query;
    const [byTitle, all, classIds] = await Promise.all([
      listStudies({ ...rest, offset: 0, count: ALL }),
      listStudies({ ...rest, title: undefined, offset: 0, count: ALL }),
      studyIdsByClassTitle(query.title),
    ]);
    const titleIds = new Set(byTitle.map((s) => s.id));
    // Walking `all` keeps the requested order and drops classes of unposted studies.
    const merged = all.filter((s) => titleIds.has(s.id) || classIds.has(s.id));
    return count ? merged.slice(offset, offset + count) : merged.slice(offset);
  }

  /**
   * A study with its classes (audio) and notes (slides/PDFs), sorted by
   * `order`, with deleted files removed. Null if it doesn't exist or isn't posted.
   */
  async function getStudy(id: number | string): Promise<Study | null> {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) return null;
    let study: Study | null;
    try {
      study = await getJson<Study>(`${apiBase}/studies/${n}`);
    } catch (err) {
      // Upstream answers an unknown id with an empty HTTP 500, not a 404.
      // Only call it "not found" if the catalog agrees; otherwise it's a real outage.
      if (err instanceof BibleTalksError && err.status === 500) {
        const catalog = await listStudies();
        if (catalog.length && !catalog.some((s) => s.id === n)) return null;
      }
      throw err;
    }
    if (!study || study.posted !== 1 || study.deleted) return null;
    const live = <T extends { deleted: number; order: number }>(xs: T[] | null | undefined) =>
      (xs ?? []).filter((x) => !x.deleted).sort((a, b) => a.order - b.order);
    return { ...study, classes: live(study.classes), notes: live(study.notes) };
  }

  /**
   * Direct URL of a class's audio or a note's file. The host sends
   * `Access-Control-Allow-Origin: *` and honours byte ranges, so it works
   * as an <audio src> or download link with no proxy.
   */
  function fileUrl(studyId: number, fileName: string): string {
    const dot = fileName.lastIndexOf('.');
    const base = dot === -1 ? fileName : fileName.slice(0, dot);
    const ext = dot === -1 ? '' : `.${fileName.slice(dot + 1).toLowerCase()}`;
    return `${fileBase}/studies/${studyId}/${encodeURIComponent(base)}${ext}`;
  }

  /** Link to the study's page on the original site, for credit. */
  function sourcePageUrl(studyId: number): string {
    return `${fileBase}/#study/${studyId}`;
  }

  return {
    listStudies,
    searchStudies,
    getStudy,
    fileUrl,
    audioUrl: (c: Pick<Class, 'study_id' | 'file_name'>) => fileUrl(c.study_id, c.file_name),
    noteUrl: (n: Pick<Note, 'study_id' | 'file_name'>) => fileUrl(n.study_id, n.file_name),
    sourcePageUrl,
    clearCache: () => cache.clear(),
  };
}

export type BibleTalksClient = ReturnType<typeof createBibleTalksClient>;

/** Distinct non-empty years, newest first. */
export function yearsOf(studies: Study[]): string[] {
  return [...new Set(studies.map((s) => s.year).filter(Boolean))].sort((a, b) => b.localeCompare(a));
}

/** Distinct non-empty locations (Bible schools, ecclesias), A to Z. */
export function locationsOf(studies: Study[]): string[] {
  return [...new Set(studies.map((s) => s.location).filter(Boolean))].sort();
}
