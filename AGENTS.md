# Instructions for AI assistants

You've been handed this folder so you can show classes from christadelphianbibletalks.com on someone's website. Read this whole file before writing code. The upstream API has several quirks that look like bugs in your code if you don't know about them.

## What you're working with

- **Upstream API:** `https://christadelphianbibletalks.com/api/v3_0`. Public, no key, CORS open (`Access-Control-Allow-Origin: *`).
- **Audio and notes files:** `https://christadelphianbibletalks.com/studies/{studyId}/{fileName}`. Also CORS open, and they honour HTTP byte ranges, so `<audio src>` seeking works with no proxy.
- **Data model:** a *study* is a series (title, speaker, location, year, description). It holds *classes* (the audio files, in order) and *notes* (PDFs and slides).
- **Size:** about 1,725 posted studies. The full list is about 650 KB of JSON and takes about 1.5 seconds. Fetch it once and filter in memory.

This kit wraps all of that. Use it rather than calling the API by hand.

## The API, in one screen

```ts
import { createBibleTalksClient, createSpeakerNormalizer, yearsOf, locationsOf } from './dist/index.js';

const talks = createBibleTalksClient();          // options: { cacheTtlMs, apiBase, fileBase, fetch }
const speakers = createSpeakerNormalizer();      // or pass your own { "Canonical Name": ["Variant", ...] }

await talks.listStudies();                       // every posted study, newest upload first
await talks.listStudies({ count: 30 });          // first page
await talks.listStudies({ yearFrom: '2020', orderBy: [{ field: 'title', direction: 'ASC' }] });
await talks.searchStudies({ title: 'Ephesians' }); // matches series titles AND individual class titles
await talks.getStudy(742);                       // study with .classes and .notes, or null

talks.audioUrl(study.classes[0]);                // direct, playable mp3 URL
talks.noteUrl(study.notes[0]);                   // direct PDF URL
talks.sourcePageUrl(study.id);                   // the study's page on the original site (link back to it)

speakers.canonicalNames(study.speaker);          // ["Roger Lewis", "Paul Billington"]
speakers.speakersOf(allStudies);                 // A to Z list for a speaker filter
speakers.studiesBy(allStudies, 'David Fraser');  // includes joint talks
speakers.withoutSpeakers(allStudies, ['Name']);  // hide speakers the site owner asks you to hide
yearsOf(allStudies); locationsOf(allStudies);
```

`listStudies` and `searchStudies` throw `BibleTalksError` when upstream is down. Catch it and show an error message. Don't show an empty list, because the visitor will think there are no talks.

## Upstream quirks (the reason this kit exists)

1. **List results never include classes.** `classes` is always `[]` in `listStudies`. Call `getStudy(id)` when the visitor opens a study.
2. **`num_classes` is wrong for about a third of studies.** It says 0 when the study has classes. Never use it to hide a study or to show a count in a list. Count `getStudy(id).classes` instead.
3. **Unposted studies exist.** About 56 studies have `posted: 0`. They're drafts or duplicates (study 741 is an unposted copy of 742). The kit filters them out of lists, and `getStudy` returns null for them.
4. **A missing study id returns HTTP 500 with an empty body, not 404.** `getStudy` checks the catalog before deciding it's missing, so a real outage still throws.
5. **The title filter only searches series titles.** A class called "Mary & Martha" inside the series "Spiritual Habits of a Sister in Christ" is invisible to it. `searchStudies` also queries the `/classes` endpoint and merges the results. Use it for any search box.
6. **The speaker field is free text.** It has honorifics ("Bro.", "Bre"), several people in one field ("A & B", "A, B and C"), ALL CAPS, venue notes in brackets and spelling variants. Run it through `createSpeakerNormalizer()` before building a speaker list or speaker pages.
7. **Deleted files.** Classes and notes carry a `deleted` flag. `getStudy` drops deleted ones and sorts the rest by `order`.
8. **Missing details.** A class's `length` can be `""`, and its `size` can be `false`. Don't print them blindly.
9. **File names need encoding.** They contain spaces, commas and brackets. Always build links with `audioUrl` or `noteUrl`, never by string concatenation.

## Wiring it into a site

Copy `src/` (TypeScript) or `dist/` (JavaScript) into the project. It has no dependencies and runs anywhere `fetch` exists: browsers, Node 18+, Deno, Bun and Cloudflare Workers.

- **Plain HTML site:** copy `dist/` next to the page and start from `examples/index.html`. The page must be served over http(s), because ES module imports don't load from `file://`.
- **React, Vue, Svelte and similar:** create one client at module level, not per component, so the cache is shared. Load the catalog once, then filter in memory as the visitor types.
- **Server-rendered (Next.js, TanStack Start, Astro, Remix):** call the client on the server for study pages. That gives search engines real titles and descriptions. The in-memory cache lasts as long as the server process. On serverless hosts it resets on cold starts, which is fine.
- **WordPress or other CMS:** add `examples/index.html` as a custom HTML block, or host it as its own page, with `dist/` uploaded alongside it.

A good first version has three things: a list with search and a speaker filter, a study page with one `<audio>` per class, and a "View on christadelphianbibletalks.com" link on every study page.

## Rules to follow

- Credit the source. Link back on every page that shows this content, using `sourcePageUrl(id)`.
- Keep the cache on (the default is one hour). Don't poll upstream or prefetch every study's details.
- Don't download, mirror or re-host the audio files. Link to them where they are.
- Don't add a server proxy for audio. The files are CORS open, and a proxy only costs bandwidth.
- If the site owner wants certain speakers hidden, use `speakers.withoutSpeakers(studies, [...])` on every list, and check `getStudy` results as well.

## Checking your work

Run `npm run build && npm test`. The test hits the live API and fails loudly if upstream changes shape. Then open the site's new page, search for "Mary & Martha" (it should find "Spiritual Habits of a Sister in Christ"), open a study, and confirm the first class's audio shows a duration.
