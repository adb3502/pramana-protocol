# Pramana protocol

*pramāṇa* (Sanskrit): a valid means of knowing.

Pramana traces claims back to the numbers they rest on. This repository is a static web page that runs the Pramana extraction protocol in your browser, on any topic, with your own model key. It is hosted at <https://adb3502.github.io/pramana-protocol/>.

The full pipeline (Python, batch ingestion, Basecamp modules) lives at <https://github.com/adb3502/pramana>.

## What the protocol is

The protocol is an open, pinned extraction pipeline. Anyone can run it on any paper and add the output to a shared knowledge base stored on Logos Storage, where files are addressed by their content ID (CID).

The data layer holds only what each paper reported: estimates, intervals, populations and designs, each with a pointer to the exact sentence or table it came from. It carries no verdicts. Interpretations such as "inflated" or "association read as cause" belong in separate signed, versioned lenses that anyone can publish over the same data.

Two independent extractions of the same paper are compared field by field. Fields that agree are accepted. Disagreements are flagged for a judge model or a person.

## The steps on the page

1. **Keys.** Pick Anthropic, OpenRouter, or an OpenAI-compatible endpoint (Jev or any other), paste a key, and set the model IDs for the designer, reader A, reader B and the judge. Defaults on Anthropic are `claude-haiku-4-5` for both readers (temperature 0 and 0.7) and `claude-sonnet-4-5` for design and judging.
2. **Topic.** Any topic or claim, for example "AI data center water use".
3. **Design.** The design model proposes 2 to 4 search queries and topic-specific fields that extend the core claim fields. Both are editable. The page hashes the schema and the prompt templates (SHA-256) and records them with the model IDs as the **pin**.
4. **Papers.** Open-access works from OpenAlex and Europe PMC, merged and de-duplicated. Where Europe PMC has the full text, the readers get it (Results, tables and Methods first, capped at 60,000 characters); otherwise they get the abstract. Every record says which.
5. **Extract twice.** Reader A and reader B read each paper independently and return strict JSON with verbatim quotes.
6. **Agree.** Deterministic comparison: normalized text match, 1% relative tolerance on numbers, and a check that each quote actually occurs in the text the readers saw. Disputed fields can go to the judge, which sees both readings and the source text around the quotes.
7. **Publish.** Records and a manifest form a bundle. Its SHA-256 is part of the file name. Download it, publish it from your own Logos node, and paste the CID back.

A demo mode runs the whole loop on two pre-recorded papers (Li, Yang, Islam and Ren, "Making AI Less Thirsty", arXiv 2304.03271; Elsworth et al., "Measuring the environmental impact of delivering AI at Google Scale", arXiv 2508.15734) without a key or any network calls. The source excerpts in the demo are verbatim from the arXiv versions; the two readers' outputs and the judge's decisions are canned, and one of each kind of disagreement is included on purpose.

## Core claim fields

Following the claim model in the main repository (an assertion, meaning who said it and the quote, is kept apart from the proposition):

| Field | Meaning |
|---|---|
| `subject` | exposure, intervention or system the finding is about |
| `outcome`, `measure` | what was measured, and the metric as named |
| `relation`, `direction` | relation the paper states, and its sign |
| `effect.value`, `effect.lower`, `effect.upper`, `effect.unit`, `effect.interval_type` | magnitude as reported |
| `population`, `design`, `conditions` | who or what, how, and the qualifiers the number depends on |
| `certainty` | modality as stated, with the hedge word |
| `origin` | the paper's own result, or one it cites |
| `source_pointer.section`, `source_pointer.quote` | where it came from, verbatim |
| `topic.*` | fields added by the design step for this topic |

## Record format

One record per paper:

```json
{
  "protocol": "pramana/0.1",
  "pin": {
    "schema_sha256": "...",
    "prompts_sha256": "...",
    "models": { "provider": "anthropic", "design": "...", "extract_a": "...", "extract_b": "...", "judge": "...", "temperature_a": 0, "temperature_b": 0.7 },
    "pin_sha256": "..."
  },
  "source": { "doi": "...", "pmcid": "...", "openalex_id": "...", "title": "...", "year": 2024, "text_kind": "full_text | abstract_only", "text_sha256": "...", "text_chars": 41230 },
  "extraction_a": { "model": "...", "temperature": 0, "claims": [] },
  "extraction_b": { "model": "...", "temperature": 0.7, "claims": [] },
  "agreement": { "rules": {}, "summary": {}, "pairs": [], "only_a": [], "only_b": [] },
  "accepted_fields": [ { "status": "accepted | judged", "claim": {}, "source_pointer": { "section": "...", "quote": "...", "reader": "A" } } ],
  "flagged": [ { "status": "flagged", "reason": "..." } ],
  "created_at": "2026-10-30T10:00:00Z",
  "contributor": "optional handle"
}
```

A bundle wraps the records with the topic, the pin, the queries, the schema, and a manifest listing each record's SHA-256. The SHA-256 of the bundle file itself goes into its name: `pramana-bundle-<first 16 hex>.json`.

## Publishing to Logos Storage

A web page cannot reach your Logos node, so publishing happens on your machine. In the folder where you saved the bundle:

```
logosctl daemon start --detach
logosctl call storage_module uploadUrl "$PWD/pramana-bundle-<hash>.json" 65536 true
logosctl call storage_module manifests | jq -r '.result.value[0].cid'
```

Paste the CID into step 7. The page keeps a list of your contributions in this browser's local storage.

The reference knowledge base published from the Pramana node (1,055 papers across seven topics) has the CID `zDvZRwzm9SDY3WQvdd87mQPz1xquMwQELC18qdPVCRUQ9f4hZPtq`. To fetch it:

```
logosctl call storage_module downloadToUrl "zDvZRwzm9SDY3WQvdd87mQPz1xquMwQELC18qdPVCRUQ9f4hZPtq" "$PWD/pramana_snapshot.json" false 65536 false false
```

## Privacy

There is no Pramana server. The page is static files.

- Your API key goes only from your browser to the provider you selected (`api.anthropic.com`, `openrouter.ai`, or the base URL you entered). It is held in memory and forgotten when the tab closes, unless you tick "Remember", which stores it in this browser's local storage.
- Changing provider clears the key field, so a key is never sent to a different endpoint by accident.
- Literature lookups go to `api.openalex.org` and `www.ebi.ac.uk` (Europe PMC). Fonts load from Google Fonts.
- Nothing is uploaded anywhere unless you publish the bundle yourself.

Anthropic calls use the `anthropic-dangerous-direct-browser-access` header, which Anthropic requires for browser requests. Use a key with a spending limit.

## Known limits

Paywalled papers are read from the abstract only, and PDFs are not parsed in the browser, so open-access papers outside Europe PMC are also abstract only. Text is English only. The comparison rules are deliberately simple and will flag paraphrases that a person would accept; the judge or a reviewer settles those. Extraction accuracy against human annotators has not yet been measured.

## Development

No build step. Open `index.html` in a browser, or serve the folder with any static server. `app.js` holds the pipeline; `demo-data.js` holds the demo inputs; `style.css` holds the visual system.

## License

MIT. See [LICENSE](LICENSE).
