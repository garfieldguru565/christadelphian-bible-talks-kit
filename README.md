# Christadelphian Bible Talks kit

This kit pulls the classes from [christadelphianbibletalks.com](https://christadelphianbibletalks.com) (about 1,700 studies, each a series of audio classes) so you can list, search and play them on your own website. It's the same code that runs the Talks section of [christadelphianresources.org](https://christadelphianresources.org), taken out and cleaned up so it has no ties to that site.

You don't need an API key, a server or a database. The Bible Talks API and its audio files both allow requests from any website, so a plain web page can use them directly.

## Using it with an AI assistant

Give your assistant (Claude, ChatGPT, Copilot or another) this whole folder and say something like:

> Read AGENTS.md in this folder, then add a Bible Talks page to my website using this kit.

[AGENTS.md](AGENTS.md) tells the assistant how the API behaves, the mistakes to avoid, and how to wire it into common website setups.

## Using it yourself

```bash
npm install
npm run build
npm test
```

`npm test` runs against the live site. It checks that the catalog loads, that one class's audio streams, and that search and speaker cleanup work.

To see the demo page, serve the folder over http (any static server works) and open `examples/index.html`:

```bash
npx serve .
```

## What's in the folder

| Path | What it is |
| --- | --- |
| `src/bibleTalks.ts` | The client: list, search and fetch studies, and build audio and notes links |
| `src/speakers.ts` | Cleans up the free-text speaker field ("Bro. Dave Fraser & CALEB LAWRENCE" becomes two tidy names) |
| `src/speakerMappings.ts` | Spelling variants for 38 speakers, checked by hand |
| `dist/` | Compiled JavaScript, ready to import from a web page or Node |
| `examples/index.html` | A working search-and-play page in one file |
| `test/smoke.mjs` | Live checks against the real API |
| `AGENTS.md` | Instructions for an AI assistant |

## Please be a good neighbour

The recordings and the catalog belong to Christadelphian Bible Talks. Link back to them on every page that uses their content (`sourcePageUrl(id)` gives you the link), keep the built-in cache switched on so you're not hitting their server on every page view, and don't bulk-download or re-host the audio.

## License

The code is MIT licensed (see [LICENSE](LICENSE)). The license covers this code only. The talks, recordings and catalog data belong to Christadelphian Bible Talks.
