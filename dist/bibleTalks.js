// Client for the public Christadelphian Bible Talks catalog
// (https://christadelphianbibletalks.com). No dependencies: it only needs a
// global `fetch`, so it runs in browsers, Node 18+, Deno, Bun and
// Cloudflare Workers.
const DEFAULT_API_BASE = 'https://christadelphianbibletalks.com/api/v3_0';
const DEFAULT_FILE_BASE = 'https://christadelphianbibletalks.com';
// The whole catalog is under 2,000 studies; one request of this size gets all of it.
const ALL = 10000;
export class BibleTalksError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'BibleTalksError';
    }
}
export function createBibleTalksClient(options = {}) {
    const apiBase = (options.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, '');
    const fileBase = (options.fileBase ?? DEFAULT_FILE_BASE).replace(/\/$/, '');
    const ttl = options.cacheTtlMs ?? 60 * 60 * 1000;
    const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
    const cache = new Map();
    // Two callers asking for the same URL at once share one request.
    const inFlight = new Map();
    /** GET a JSON URL. Returns null on 404, throws BibleTalksError on other failures. */
    async function getJson(url) {
        const hit = cache.get(url);
        if (hit && hit.expiresAt > Date.now())
            return hit.data;
        const pending = inFlight.get(url);
        if (pending)
            return pending;
        const promise = (async () => {
            const res = await doFetch(url);
            if (res.status === 404)
                return null;
            if (!res.ok)
                throw new BibleTalksError(`Upstream returned HTTP ${res.status} for ${url}`, res.status);
            const data = await res.json();
            if (ttl > 0)
                cache.set(url, { data, expiresAt: Date.now() + ttl });
            return data;
        })();
        inFlight.set(url, promise);
        try {
            return (await promise);
        }
        finally {
            inFlight.delete(url);
        }
    }
    function studiesUrl(q) {
        const p = new URLSearchParams();
        // Unposted studies are drafts on the upstream site; never show them.
        p.append('filter[0][posted]', '1');
        if (q.title)
            p.append('filter[1][title][$contains]', q.title);
        if (q.speaker)
            p.append('filter[2][speaker]', q.speaker);
        if (q.yearFrom)
            p.append('filter[3][year][$gte]', q.yearFrom);
        if (q.yearTo)
            p.append(`filter[${q.yearFrom ? 4 : 3}][year][$lte]`, q.yearTo);
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
    async function listStudies(query = {}) {
        return (await getJson(studiesUrl(query))) ?? [];
    }
    /** IDs of studies with a live class whose title contains `text` (case-insensitive). */
    async function studyIdsByClassTitle(text) {
        const p = new URLSearchParams();
        p.append('filter[0][title][$contains]', text);
        p.append('count', String(ALL));
        const classes = (await getJson(`${apiBase}/classes?${p}`)) ?? [];
        return new Set(classes.filter((c) => !c.deleted).map((c) => c.study_id));
    }
    /**
     * Like listStudies, but `title` also matches the titles of individual
     * classes, so "Mary & Martha" finds a series that only mentions them in
     * class 9. Order and year filters still apply; offset/count are applied
     * after merging.
     */
    async function searchStudies(query = {}) {
        if (!query.title)
            return listStudies(query);
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
    async function getStudy(id) {
        const n = Number(id);
        if (!Number.isInteger(n) || n <= 0)
            return null;
        let study;
        try {
            study = await getJson(`${apiBase}/studies/${n}`);
        }
        catch (err) {
            // Upstream answers an unknown id with an empty HTTP 500, not a 404.
            // Only call it "not found" if the catalog agrees; otherwise it's a real outage.
            if (err instanceof BibleTalksError && err.status === 500) {
                const catalog = await listStudies();
                if (catalog.length && !catalog.some((s) => s.id === n))
                    return null;
            }
            throw err;
        }
        if (!study || study.posted !== 1 || study.deleted)
            return null;
        const live = (xs) => (xs ?? []).filter((x) => !x.deleted).sort((a, b) => a.order - b.order);
        return { ...study, classes: live(study.classes), notes: live(study.notes) };
    }
    /**
     * Direct URL of a class's audio or a note's file. The host sends
     * `Access-Control-Allow-Origin: *` and honours byte ranges, so it works
     * as an <audio src> or download link with no proxy.
     */
    function fileUrl(studyId, fileName) {
        const dot = fileName.lastIndexOf('.');
        const base = dot === -1 ? fileName : fileName.slice(0, dot);
        const ext = dot === -1 ? '' : `.${fileName.slice(dot + 1).toLowerCase()}`;
        return `${fileBase}/studies/${studyId}/${encodeURIComponent(base)}${ext}`;
    }
    /** Link to the study's page on the original site, for credit. */
    function sourcePageUrl(studyId) {
        return `${fileBase}/#study/${studyId}`;
    }
    return {
        listStudies,
        searchStudies,
        getStudy,
        fileUrl,
        audioUrl: (c) => fileUrl(c.study_id, c.file_name),
        noteUrl: (n) => fileUrl(n.study_id, n.file_name),
        sourcePageUrl,
        clearCache: () => cache.clear(),
    };
}
/** Distinct non-empty years, newest first. */
export function yearsOf(studies) {
    return [...new Set(studies.map((s) => s.year).filter(Boolean))].sort((a, b) => b.localeCompare(a));
}
/** Distinct non-empty locations (Bible schools, ecclesias), A to Z. */
export function locationsOf(studies) {
    return [...new Set(studies.map((s) => s.location).filter(Boolean))].sort();
}
