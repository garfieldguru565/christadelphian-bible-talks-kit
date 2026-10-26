/** Canonical name -> spellings that should count as that person. */
export type SpeakerMappings = Record<string, string[]>;
/** Split a raw speaker field into individual names (a talk can credit several people). */
export declare function parseSpeakerNames(rawSpeaker: string | null | undefined): string[];
/**
 * Build a speaker normaliser. Pass your own mappings to add or override
 * spellings; by default it uses the list curated for christadelphianresources.org.
 */
export declare function createSpeakerNormalizer(mappings?: SpeakerMappings): {
    canonicalName: (name: string) => string;
    canonicalNames: (rawSpeaker: string | null | undefined) => string[];
    speakersOf: (studies: {
        speaker: string;
    }[]) => string[];
    studiesBy: <T extends {
        speaker: string;
    }>(studies: T[], speaker: string) => T[];
    withoutSpeakers: <T extends {
        speaker: string;
    }>(studies: T[], excluded: string[]) => T[];
};
