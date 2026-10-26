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
    orderBy?: {
        field: SortField;
        direction: 'ASC' | 'DESC';
    }[];
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
export declare class BibleTalksError extends Error {
    readonly status?: number | undefined;
    constructor(message: string, status?: number | undefined);
}
export declare function createBibleTalksClient(options?: ClientOptions): {
    listStudies: (query?: StudiesQuery) => Promise<Study[]>;
    searchStudies: (query?: StudiesQuery) => Promise<Study[]>;
    getStudy: (id: number | string) => Promise<Study | null>;
    fileUrl: (studyId: number, fileName: string) => string;
    audioUrl: (c: Pick<Class, "study_id" | "file_name">) => string;
    noteUrl: (n: Pick<Note, "study_id" | "file_name">) => string;
    sourcePageUrl: (studyId: number) => string;
    clearCache: () => void;
};
export type BibleTalksClient = ReturnType<typeof createBibleTalksClient>;
/** Distinct non-empty years, newest first. */
export declare function yearsOf(studies: Study[]): string[];
/** Distinct non-empty locations (Bible schools, ecclesias), A to Z. */
export declare function locationsOf(studies: Study[]): string[];
