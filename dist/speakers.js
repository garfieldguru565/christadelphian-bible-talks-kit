// Cleanup for the upstream `speaker` field, which is free text typed by many
// uploaders: "Bro. Roger Lewis", "CALEB LAWRENCE", "Roger Lewis & Paul
// Billington", "Dave Fraser" vs "David Fraser". These helpers turn it into a
// list of tidy, de-duplicated names so a speaker list or speaker page works.
import { defaultSpeakerMappings } from './speakerMappings.js';
// "Bro. Roger Lewis", "Bre Roger Lewis, Paul Billington"
const HONORIFIC_PREFIX = /^(?:bro\.?|brother|bre\.?|brethren)\s+/i;
function stripSpeakerNoise(name) {
    let cleaned = name.trim().replace(HONORIFIC_PREFIX, '');
    // A leading conjunction left over from splitting, e.g. "and Harry Tennant"
    cleaned = cleaned.replace(/^and\s+/i, '');
    // A trailing venue note, e.g. "Roger Lewis (Christchurch North (NZ)"
    const paren = cleaned.indexOf('(');
    if (paren !== -1)
        cleaned = cleaned.slice(0, paren);
    // Runs of trailing dots ("Stephen Whitehouse...."), keeping initials like "H.P. Mansfield"
    cleaned = cleaned.replace(/\.{2,}$/, '').trim();
    // Names typed in all caps
    if (cleaned.length > 3 && cleaned === cleaned.toUpperCase() && /[A-Z]/.test(cleaned)) {
        cleaned = cleaned.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
    }
    return cleaned.trim();
}
/** Split a raw speaker field into individual names (a talk can credit several people). */
export function parseSpeakerNames(rawSpeaker) {
    if (!rawSpeaker)
        return [];
    const names = rawSpeaker
        .split(/\s*[,&]\s*|\s+and\s+/i)
        .map(stripSpeakerNoise)
        .filter(Boolean);
    return [...new Set(names)];
}
/**
 * Build a speaker normaliser. Pass your own mappings to add or override
 * spellings; by default it uses the list curated for christadelphianresources.org.
 */
export function createSpeakerNormalizer(mappings = defaultSpeakerMappings) {
    const aliasToCanonical = new Map();
    for (const [canonical, aliases] of Object.entries(mappings)) {
        aliasToCanonical.set(canonical, canonical);
        for (const alias of aliases)
            aliasToCanonical.set(alias, canonical);
    }
    /** The canonical spelling of one already-parsed name. */
    const canonicalName = (name) => aliasToCanonical.get(name) ?? name;
    /** Canonical names credited on a raw speaker field. */
    const canonicalNames = (rawSpeaker) => [
        ...new Set(parseSpeakerNames(rawSpeaker).map(canonicalName)),
    ];
    /** Every canonical speaker across a list of studies, A to Z. */
    const speakersOf = (studies) => [...new Set(studies.flatMap((s) => canonicalNames(s.speaker)))].sort();
    /** Studies that credit this canonical speaker, including joint talks. */
    const studiesBy = (studies, speaker) => studies.filter((s) => canonicalNames(s.speaker).includes(speaker));
    /** Drop studies crediting any of these speakers (matched after normalising). */
    const withoutSpeakers = (studies, excluded) => {
        const hidden = new Set(excluded.map((n) => n.trim().toLowerCase()));
        return studies.filter((s) => !canonicalNames(s.speaker).some((n) => hidden.has(n.toLowerCase())));
    };
    return { canonicalName, canonicalNames, speakersOf, studiesBy, withoutSpeakers };
}
