/* Pramana protocol, browser runner. MIT licensed.
   Everything here runs client-side. Model calls go from this page directly to the
   provider the user picked; literature calls go to OpenAlex and Europe PMC. */
(function () {
  "use strict";

  const PROTOCOL = "pramana/0.1";
  const APP_VERSION = "0.1.0";
  const APP_URL = "https://adb3502.github.io/pramana-protocol/contribute/";
  const DEMO = window.PRAMANA_DEMO;
  const TEXT_BUDGET = 60000;
  const STORE_KEYS = "pramana.keys.v1";
  const STORE_CONTRIB = "pramana.contributions.v1";

  /* ------------------------------------------------------------------ */
  /* Small utilities                                                    */
  /* ------------------------------------------------------------------ */

  const $ = (id) => document.getElementById(id);

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (k === "dataset") Object.assign(el.dataset, v);
        else el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
    }
    return el;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  const store = {
    get(k) { try { const v = window.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      if (signal) signal.addEventListener("abort", () => { clearTimeout(t); reject(abortError()); }, { once: true });
    });
  }
  function abortError() { const e = new Error("Stopped"); e.name = "AbortError"; return e; }
  const isAbort = (e) => e && e.name === "AbortError";

  class PErr extends Error {
    constructor(msg, extra) { super(msg); this.name = "PErr"; Object.assign(this, extra || {}); }
  }

  const fmtInt = (n) => Math.round(n || 0).toLocaleString("en-US");
  const fmtUsd = (n) => "$" + (n < 0.1 ? n.toFixed(3) : n.toFixed(2));
  const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function scrollToId(id) {
    const el = $(id);
    if (el) el.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
  }

  async function pool(items, n, fn) {
    let i = 0;
    const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const idx = i++; await fn(items[idx], idx); }
    });
    await Promise.all(workers);
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /* Stable JSON with sorted keys, used for every hash. */
  function canon(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  }

  /* SHA-256: SubtleCrypto when available, a small fallback otherwise. */
  let SHA_K = null, SHA_H0 = null;
  function shaConsts() {
    if (SHA_K) return;
    const primes = [];
    for (let n = 2; primes.length < 64; n++) { if (primes.every((p) => n % p)) primes.push(n); }
    const frac = (x) => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0;
    SHA_K = primes.map((p) => frac(Math.cbrt(p)));
    SHA_H0 = primes.slice(0, 8).map((p) => frac(Math.sqrt(p)));
  }
  function sha256Fallback(str) {
    shaConsts();
    const bytes = new TextEncoder().encode(str);
    const l = bytes.length;
    const total = ((l + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(bytes); buf[l] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 4, (l * 8) >>> 0);
    dv.setUint32(total - 8, Math.floor((l * 8) / 4294967296));
    const H = SHA_H0.slice();
    const W = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let i = 0; i < total; i += 64) {
      for (let t = 0; t < 16; t++) W[t] = dv.getUint32(i + t * 4);
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
        const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, hh] = H;
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + S1 + ch + SHA_K[t] + W[t]) | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const mj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + mj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + hh) | 0;
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
  }
  async function sha256hex(str) {
    try {
      if (window.crypto && window.crypto.subtle) {
        const d = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
        return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (e) { /* fall through */ }
    return sha256Fallback(str);
  }

  function getPath(obj, path) {
    return path.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
  }
  function setPath(obj, path, val) {
    const ks = path.split(".");
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) {
      if (!o[ks[i]] || typeof o[ks[i]] !== "object") o[ks[i]] = {};
      o = o[ks[i]];
    }
    o[ks[ks.length - 1]] = val;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function stripTags(s) {
    if (!s) return "";
    try {
      const doc = new DOMParser().parseFromString("<body>" + s + "</body>", "text/html");
      return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
    } catch (e) { return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
  }

  /* ------------------------------------------------------------------ */
  /* Core schema and pinned prompt templates                            */
  /* ------------------------------------------------------------------ */

  const CORE_FIELDS = {
    subject: "string: the exposure, intervention, system or thing the finding is about",
    outcome: "string: what was measured or affected",
    measure: "string: the metric as the paper names it, e.g. 'Wh per prompt', 'odds ratio', 'mean difference'",
    relation: "enum[increases, decreases, associated_with, no_association, quantifies, compares, not stated]: the relation the paper states",
    direction: "enum[positive, negative, null, mixed, not_applicable, not stated]",
    effect: {
      value: "number|null: point estimate exactly as reported",
      lower: "number|null: lower bound of the interval or range",
      upper: "number|null: upper bound of the interval or range",
      unit: "string|null: unit as written",
      interval_type: "string|null: e.g. '95% CI', 'range', 'IQR', 'SD'"
    },
    population: "string: who or what was studied, with sample size if given",
    design: "string: study design, e.g. randomized trial, cohort, cross-sectional, direct measurement, model-based estimate, review",
    conditions: "string|null: time, place, dose, boundary or other qualifiers the number depends on",
    certainty: "string: the modality as stated, with the hedge word if any, e.g. 'measured', 'estimated: roughly', 'may'",
    origin: "enum[own_result, cited, not stated]: the paper's own finding, or one it reports from other work",
    source_pointer: {
      section: "string: section, table or figure label",
      quote: "string: verbatim text copied from the paper, at most 300 characters"
    }
  };

  const PROMPTS = {
    design_system:
      "You design literature extraction protocols for Pramana, a system that records what papers reported (estimates, intervals, populations, designs), each with a pointer to the exact source sentence. You do not judge, rank or summarize papers. Reply with one JSON object and nothing else.",
    design_user:
      "Topic or claim: {{topic}}\n\n" +
      "1. Write 2 to 4 search queries for scholarly databases (OpenAlex and Europe PMC). Use plain keywords, no boolean operators, 3 to 7 words each. Cover the main measured quantities and their common synonyms.\n" +
      "2. Add 3 to 8 topic-specific fields that a careful reader would need to record, beyond the core fields below, so that numbers from different papers on this topic can be compared. Each value is a short description that starts with its type: \"string: ...\", \"number: ...\" or \"enum[a, b, not stated]: ...\". Include \"not stated\" in every enum. Use snake_case names. Do not repeat core fields.\n\n" +
      "Core fields (fixed):\n{{core_fields}}\n\n" +
      "Reply with JSON of this shape:\n" +
      "{\"queries\": [\"...\"], \"topic_fields\": {\"field_name\": \"type: description\"}, \"note\": \"one sentence on what makes numbers on this topic hard to compare\"}",
    extract_system:
      "You are a reader in the Pramana extraction protocol. You record what a paper reported, field by field, following a schema. Rules: record only findings the text states; never infer, convert units or compute; copy numbers exactly as written; use null for anything not reported; every claim needs a verbatim quote copied character for character from the text (one or two sentences, at most 300 characters); prefer the paper's own results, and mark results it reports from other work with origin \"cited\". Reply with one JSON object and nothing else.",
    extract_user:
      "Schema. Each claim is one object with these fields; \"topic\" holds the topic_fields:\n{{schema}}\n\n" +
      "Paper:\n{{meta}}\n\n" +
      "Text available: {{text_kind}}.\n\n" +
      "Return at most {{max_claims}} claims, the paper's central quantitative findings first. Use this shape:\n" +
      "{\"claims\": [{{claim_template}}]}\n" +
      "If the text reports nothing relevant to the schema, return {\"claims\": []}.\n\n" +
      "<paper_text>\n{{text}}\n</paper_text>",
    judge_system:
      "You are the judge in the Pramana extraction protocol. Two readers extracted the same claim from one paper and disagree on some fields. Decide each disputed field using only the source text provided. If the text does not settle a field, answer \"neither\" and say what is missing. Reply with one JSON object and nothing else.",
    judge_user:
      "Paper: {{title}}\n\nDisputed fields: {{fields}}\n\nReader A's claim:\n{{a}}\n\nReader B's claim:\n{{b}}\n\n" +
      "Source text:\n<source>\n{{excerpt}}\n</source>\n\n" +
      "Reply with JSON of this shape:\n" +
      "{\"decisions\": [{\"field\": \"the field path exactly as listed\", \"value\": \"the value the text supports, or null\", \"basis\": \"A\" | \"B\" | \"both\" | \"neither\", \"quote\": \"verbatim supporting text, or an empty string\", \"reason\": \"one sentence\"}]}",
    json_retry:
      "\n\nYour previous reply could not be parsed as JSON ({{error}}). Reply again with only the JSON object: no prose, no code fences."
  };

  function fill(tpl, vars) {
    return tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  }

  function makeSchema(topic, topicFields) {
    return { name: "pramana.claim", version: "0.1", topic: topic || "", core: clone(CORE_FIELDS), topic_fields: topicFields || {} };
  }

  function claimTemplate(schema) {
    const t = {};
    const core = schema.core || {};
    for (const [k, v] of Object.entries(core)) {
      if (v && typeof v === "object") { t[k] = {}; for (const kk of Object.keys(v)) t[k][kk] = null; }
      else t[k] = null;
    }
    const topic = {};
    for (const k of Object.keys(schema.topic_fields || {})) topic[k] = null;
    t.topic = topic;
    return JSON.stringify(t);
  }

  function fieldPaths(schema) {
    const out = [];
    for (const [k, v] of Object.entries(schema.core || {})) {
      if (k === "source_pointer") continue;
      if (v && typeof v === "object") for (const kk of Object.keys(v)) out.push(k + "." + kk);
      else out.push(k);
    }
    for (const k of Object.keys(schema.topic_fields || {})) out.push("topic." + k);
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* State                                                              */
  /* ------------------------------------------------------------------ */

  const PROVIDERS = {
    anthropic: {
      label: "Anthropic",
      keyHint: "sk-ant-...",
      models: { design: "claude-sonnet-4-5", judge: "claude-sonnet-4-5", a: "claude-haiku-4-5", b: "claude-haiku-4-5" }
    },
    openrouter: {
      label: "OpenRouter",
      keyHint: "sk-or-...",
      models: { design: "anthropic/claude-sonnet-4.5", judge: "anthropic/claude-sonnet-4.5", a: "anthropic/claude-haiku-4.5", b: "anthropic/claude-haiku-4.5" }
    },
    compatible: {
      label: "OpenAI-compatible",
      keyHint: "key, if your endpoint needs one",
      models: { design: "", judge: "", a: "", b: "" }
    }
  };

  const S = {
    demo: false,
    schema: null,
    schemaError: null,
    pin: null,
    papers: [],
    run: null,          // { pin, schema, cfg, topic, queries, started_at }
    runs: {},           // uid -> per-paper run
    usage: { calls: 0, inTok: 0, outTok: 0, cost: 0, unpriced: 0 },
    ctrl: null,
    extracting: false,
    judging: false,
    bundle: null
  };

  function cfg() {
    const provider = (document.querySelector('input[name="provider"]:checked') || {}).value || "anthropic";
    const t = (id, d) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d; };
    return {
      provider,
      key: $("apiKey").value.trim(),
      baseUrl: $("baseUrl").value.trim(),
      models: {
        design: $("mDesign").value.trim(),
        judge: $("mJudge").value.trim(),
        a: $("mA").value.trim(),
        b: $("mB").value.trim()
      },
      temps: { a: t("tA", 0), b: t("tB", 0.7) }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Usage ledger                                                       */
  /* ------------------------------------------------------------------ */

  function priceFor(model) {
    const m = (model || "").toLowerCase();
    if (/haiku[-.]?4/.test(m)) return [1, 5];
    if (/haiku[-.]?3[-.]5/.test(m)) return [0.8, 4];
    if (/sonnet[-.]?[34]/.test(m)) return [3, 15];
    if (/opus[-.]?4[-.]?[5-9]/.test(m)) return [5, 25];
    if (/opus[-.]?4/.test(m)) return [15, 75];
    return null;
  }

  function addUsage(model, inTok, outTok) {
    S.usage.calls += 1;
    S.usage.inTok += inTok || 0;
    S.usage.outTok += outTok || 0;
    const p = priceFor(model);
    if (p) S.usage.cost += ((inTok || 0) * p[0] + (outTok || 0) * p[1]) / 1e6;
    else S.usage.unpriced += 1;
    renderLedger();
  }

  function renderLedger() {
    $("lgCalls").textContent = fmtInt(S.usage.calls);
    $("lgIn").textContent = fmtInt(S.usage.inTok);
    $("lgOut").textContent = fmtInt(S.usage.outTok);
    $("lgCost").textContent = S.demo ? "not charged (demo)" : fmtUsd(S.usage.cost) + (S.usage.unpriced ? " + unpriced calls" : "");
  }

  /* ------------------------------------------------------------------ */
  /* Logs and errors                                                    */
  /* ------------------------------------------------------------------ */

  function log(id, msg, kind) {
    const el = $(id);
    if (!el) return;
    const t = new Date();
    const stamp = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0") + ":" + String(t.getSeconds()).padStart(2, "0");
    el.appendChild(h("div", { class: kind === "err" ? "e" : kind === "ok" ? "o" : null }, stamp + "  " + msg));
    while (el.childNodes.length > 300) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }
  function showErr(id, msg) { const el = $(id); if (el) el.textContent = msg || ""; }
  function setStatus(id, msg, kind) {
    const el = $(id);
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status" + (kind ? " " + kind : "");
  }

  /* ------------------------------------------------------------------ */
  /* Model transport                                                    */
  /* ------------------------------------------------------------------ */

  function endpoint(c) {
    if (c.provider === "anthropic") return "https://api.anthropic.com/v1/messages";
    if (c.provider === "openrouter") return "https://openrouter.ai/api/v1/chat/completions";
    let u = c.baseUrl.replace(/\/+$/, "");
    if (!/\/chat\/completions$/.test(u)) u += "/chat/completions";
    return u;
  }

  function checkCfg(c, models) {
    if (c.provider === "compatible") {
      if (!/^https?:\/\//i.test(c.baseUrl)) throw new PErr("Enter the base URL of your OpenAI-compatible endpoint in step 1.", { step: "s1" });
    } else if (!c.key) {
      throw new PErr("Paste an API key in step 1 first, or run the demo.", { step: "s1" });
    }
    for (const m of models || []) {
      if (!c.models[m]) throw new PErr("Model ID for " + ({ design: "design", judge: "judge", a: "reader A", b: "reader B" }[m]) + " is empty (step 1).", { step: "s1" });
    }
  }

  function providerMessage(status, bodyText) {
    let msg = "";
    try {
      const j = JSON.parse(bodyText);
      msg = (j.error && (j.error.message || j.error.type)) || j.message || "";
      if (typeof j.error === "string") msg = j.error;
    } catch (e) { msg = (bodyText || "").slice(0, 200); }
    return msg;
  }

  async function llmCall(o) {
    if (S.demo) return demoLLM(o);
    const c = o.cfg || cfg();
    const url = endpoint(c);
    const host = new URL(url).host;
    let headers, body;
    if (c.provider === "anthropic") {
      headers = {
        "content-type": "application/json",
        "x-api-key": c.key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      };
      body = { model: o.model, max_tokens: o.maxTokens || 4096, temperature: o.temperature ?? 0, system: o.system, messages: [{ role: "user", content: o.user }] };
    } else {
      headers = { "content-type": "application/json" };
      if (c.key) headers["authorization"] = "Bearer " + c.key;
      if (c.provider === "openrouter") {
        headers["x-title"] = "Pramana protocol";
        if (/^https?:/.test(location.protocol)) headers["http-referer"] = location.origin + location.pathname;
      }
      body = {
        model: o.model, max_tokens: o.maxTokens || 4096, temperature: o.temperature ?? 0,
        messages: [{ role: "system", content: o.system }, { role: "user", content: o.user }]
      };
    }

    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: o.signal });
      } catch (e) {
        if (isAbort(e)) throw e;
        throw new PErr("Could not reach " + host + ". The request was blocked before it got an answer: check your connection, and for a custom endpoint check that it allows browser requests (CORS).");
      }
      if (res.ok) {
        let j;
        try { j = await res.json(); } catch (e) { throw new PErr(host + " returned a response that is not JSON."); }
        let text = "", inTok = 0, outTok = 0, truncated = false;
        if (c.provider === "anthropic") {
          text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
          inTok = (j.usage && j.usage.input_tokens) || 0;
          outTok = (j.usage && j.usage.output_tokens) || 0;
          truncated = j.stop_reason === "max_tokens";
        } else {
          const ch = (j.choices || [])[0] || {};
          const content = ch.message ? ch.message.content : ch.text;
          text = Array.isArray(content) ? content.map((p) => (typeof p === "string" ? p : p.text || "")).join("") : (content || "");
          inTok = (j.usage && (j.usage.prompt_tokens || j.usage.input_tokens)) || 0;
          outTok = (j.usage && (j.usage.completion_tokens || j.usage.output_tokens)) || 0;
          truncated = ch.finish_reason === "length";
          if (j.error) throw new PErr(host + ": " + (j.error.message || JSON.stringify(j.error)));
        }
        if (!inTok) inTok = Math.ceil(((o.system || "").length + o.user.length) / 4);
        if (!outTok) outTok = Math.ceil(text.length / 4);
        addUsage(o.model, inTok, outTok);
        return { text, inTok, outTok, truncated };
      }
      const bodyText = await res.text().catch(() => "");
      const msg = providerMessage(res.status, bodyText);
      if (res.status === 401 || res.status === 403) {
        throw new PErr("The key was rejected by " + host + " (HTTP " + res.status + ")" + (msg ? ": " + msg : "") + ". Check the key and provider in step 1.", { step: "s1", fatal: true });
      }
      if (res.status === 404 || (res.status === 400 && /model/i.test(msg))) {
        throw new PErr(host + " does not recognise model \"" + o.model + "\" (HTTP " + res.status + ")" + (msg ? ": " + msg : "") + ". Edit the model ID in step 1.", { step: "s1", fatal: true });
      }
      const retryable = res.status === 429 || res.status === 408 || res.status === 529 || res.status >= 500;
      if (retryable && attempt < 3) {
        let wait = 2000 * Math.pow(2, attempt);
        const ra = parseFloat(res.headers.get("retry-after"));
        if (Number.isFinite(ra) && ra > 0) wait = Math.min(60000, ra * 1000);
        if (o.onRetry) o.onRetry((res.status === 429 ? "Rate limited" : "Provider busy") + " (HTTP " + res.status + "), retrying in " + Math.round(wait / 1000) + " s");
        await sleep(wait, o.signal);
        continue;
      }
      if (res.status === 429) throw new PErr("Rate limit reached at " + host + (msg ? ": " + msg : "") + ". Wait a minute, or select fewer papers.");
      throw new PErr("HTTP " + res.status + " from " + host + (msg ? ": " + msg : ""));
    }
  }

  function parseJSONLoose(text) {
    let t = String(text || "").trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    try { return JSON.parse(t); } catch (e) { /* continue */ }
    const first = t.search(/[{[]/);
    if (first < 0) throw new Error("no JSON object found");
    const open = t[first], close = open === "{" ? "}" : "]";
    const last = t.lastIndexOf(close);
    if (last <= first) throw new Error("the JSON object is not closed; the reply may have been cut off");
    let s = t.slice(first, last + 1);
    try { return JSON.parse(s); } catch (e) { /* continue */ }
    s = s.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(s);
  }

  async function llmJSON(o) {
    let r = await llmCall(o);
    try { return { data: parseJSONLoose(r.text), raw: r.text }; }
    catch (e1) {
      if (o.onRetry) o.onRetry("Reply was not valid JSON (" + e1.message + "), asking once more");
      const o2 = Object.assign({}, o, {
        user: o.user + fill(PROMPTS.json_retry, { error: e1.message }) + (r.truncated ? " Keep the reply shorter: return fewer claims." : ""),
        maxTokens: r.truncated ? Math.min(16000, (o.maxTokens || 4096) * 2) : o.maxTokens
      });
      r = await llmCall(o2);
      try { return { data: parseJSONLoose(r.text), raw: r.text }; }
      catch (e2) { throw new PErr("The model did not return valid JSON after a retry (" + e2.message + ").", { raw: r.text }); }
    }
  }

  /* Demo transport: same call shape, canned answers. */
  async function demoLLM(o) {
    await sleep(350 + Math.random() * 500, o.signal);
    let data;
    if (o.kind === "design") data = { queries: DEMO.design.queries, topic_fields: DEMO.design.topic_fields, note: DEMO.design.note };
    else if (o.kind === "extract") data = DEMO.extractions[o.ctx.uid][o.ctx.reader];
    else if (o.kind === "judge") {
      const canned = (DEMO.judge[o.ctx.uid]) || {};
      data = {
        decisions: o.ctx.fields.map((f) => canned[f]
          ? Object.assign({ field: f }, canned[f])
          : { field: f, value: null, basis: "neither", quote: "", reason: "The demo has no recorded judge decision for this field." })
      };
    } else data = { ok: true };
    const text = JSON.stringify(data);
    const inTok = Math.ceil(((o.system || "").length + o.user.length) / 4);
    const outTok = Math.ceil(text.length / 4);
    addUsage(o.model, inTok, outTok);
    return { text, inTok, outTok, truncated: false };
  }

  /* ------------------------------------------------------------------ */
  /* Step 1: keys                                                       */
  /* ------------------------------------------------------------------ */

  function applyProviderDefaults(p) {
    const d = PROVIDERS[p].models;
    $("mDesign").value = d.design; $("mJudge").value = d.judge; $("mA").value = d.a; $("mB").value = d.b;
  }

  function onProviderChange(keepModels) {
    const p = cfg().provider;
    $("baseUrlField").hidden = p !== "compatible";
    $("apiKey").placeholder = PROVIDERS[p].keyHint;
    if (!keepModels) {
      applyProviderDefaults(p);
      // A key belongs to one provider; never carry it over to another endpoint.
      $("apiKey").value = "";
      setStatus("keyStatus", "Provider changed. Paste a key for " + PROVIDERS[p].label + ".", "");
    }
    persistKeys();
    updateGates();
  }

  function persistKeys() {
    if (!$("rememberKey").checked) return;
    const c = cfg();
    store.set(STORE_KEYS, { provider: c.provider, key: c.key, baseUrl: c.baseUrl, models: c.models, temps: c.temps });
  }

  function loadKeys() {
    const saved = store.get(STORE_KEYS);
    if (!saved) { applyProviderDefaults("anthropic"); return; }
    const r = document.querySelector('input[name="provider"][value="' + (PROVIDERS[saved.provider] ? saved.provider : "anthropic") + '"]');
    if (r) r.checked = true;
    $("apiKey").value = saved.key || "";
    $("baseUrl").value = saved.baseUrl || "";
    const m = saved.models || {};
    const d = PROVIDERS[cfg().provider].models;
    $("mDesign").value = m.design || d.design; $("mJudge").value = m.judge || d.judge;
    $("mA").value = m.a || d.a; $("mB").value = m.b || d.b;
    if (saved.temps) { $("tA").value = saved.temps.a; $("tB").value = saved.temps.b; }
    $("rememberKey").checked = true;
    onProviderChange(true);
    setStatus("keyStatus", "Loaded the key and settings saved on this device.", "ok");
  }

  async function testKey() {
    const c = cfg();
    try {
      checkCfg(c, ["design"]);
      setStatus("keyStatus", "Sending a one-line test request to " + new URL(endpoint(c)).host + "...", "");
      $("testKeyBtn").disabled = true;
      const r = await llmCall({ cfg: c, model: c.models.design, system: "Reply with the single word: ok", user: "ok?", maxTokens: 16, temperature: 0 });
      setStatus("keyStatus", "The key works. " + c.models.design + " answered: " + JSON.stringify(r.text.trim().slice(0, 40)), "ok");
    } catch (e) {
      setStatus("keyStatus", e.message, "err");
    } finally { $("testKeyBtn").disabled = false; }
  }

  /* ------------------------------------------------------------------ */
  /* Step 3: design                                                     */
  /* ------------------------------------------------------------------ */

  async function runDesign() {
    const topic = $("topic").value.trim();
    setStatus("topicStatus", "");
    showErr("designErr", "");
    if (!topic) { setStatus("topicStatus", "Type a topic or claim first.", "err"); $("topic").focus(); return false; }
    const c = cfg();
    try { if (!S.demo) checkCfg(c, ["design"]); }
    catch (e) { setStatus("topicStatus", e.message, "err"); return false; }

    const btn = $("designBtn");
    btn.disabled = true; btn.classList.add("spin");
    log("designLog", "Asking " + (S.demo ? "the demo designer" : c.models.design) + " for search queries and topic fields");
    try {
      const user = fill(PROMPTS.design_user, { topic, core_fields: JSON.stringify(CORE_FIELDS, null, 2) });
      const { data } = await llmJSON({
        kind: "design", cfg: c, model: c.models.design || "demo", system: PROMPTS.design_system, user,
        temperature: 0.2, maxTokens: 2000, onRetry: (m) => log("designLog", m)
      });
      let queries = Array.isArray(data.queries) ? data.queries.filter((q) => typeof q === "string" && q.trim()).map((q) => q.trim()).slice(0, 4) : [];
      if (!queries.length) queries = [topic];
      const tf = {};
      if (data.topic_fields && typeof data.topic_fields === "object" && !Array.isArray(data.topic_fields)) {
        for (const [k, v] of Object.entries(data.topic_fields).slice(0, 8)) {
          const key = String(k).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
          if (!key || key in CORE_FIELDS || key === "topic") continue;
          tf[key] = typeof v === "string" ? v : JSON.stringify(v);
        }
      }
      setDesign(topic, queries, tf, typeof data.note === "string" ? data.note : "");
      log("designLog", "Design ready: " + queries.length + " queries, " + Object.keys(tf).length + " topic fields", "ok");
      return true;
    } catch (e) {
      if (isAbort(e)) return false;
      log("designLog", e.message, "err");
      showErr("designErr", e.message + (e.step === "s1" ? "" : " You can also skip the design call and use the core schema."));
      return false;
    } finally { btn.disabled = false; btn.classList.remove("spin"); }
  }

  function setDesign(topic, queries, topicFields, note) {
    $("queries").value = queries.join("\n");
    $("schema").value = JSON.stringify(makeSchema(topic, topicFields), null, 2);
    $("designNote").hidden = !note;
    $("designNote").textContent = note ? "Designer's note: " + note : "";
    $("designOut").hidden = false;
    onSchemaInput();
  }

  function coreOnly() {
    const topic = $("topic").value.trim();
    if (!topic) { setStatus("topicStatus", "Type a topic or claim first.", "err"); return; }
    setStatus("topicStatus", "");
    showErr("designErr", "");
    setDesign(topic, [topic], {}, "");
    log("designLog", "Using the core schema with no topic fields; the search uses your topic as the query", "ok");
    scrollToId("s3");
  }

  function validateSchema(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "The schema must be a JSON object.";
    if (!obj.core || typeof obj.core !== "object") return "The schema needs a \"core\" object.";
    if (!obj.core.source_pointer || typeof obj.core.source_pointer !== "object" || !("quote" in obj.core.source_pointer)) return "core.source_pointer.quote is required: every claim must point to its source text.";
    if (obj.topic_fields !== undefined && (typeof obj.topic_fields !== "object" || Array.isArray(obj.topic_fields) || obj.topic_fields === null)) return "\"topic_fields\" must be an object of field name to description.";
    return null;
  }

  async function computePin(schema) {
    const c = cfg();
    const models = S.demo
      ? { provider: "demo", design: "demo-design", extract_a: "demo-reader-a", extract_b: "demo-reader-b", judge: "demo-judge", temperature_a: 0, temperature_b: 0.7 }
      : { provider: c.provider, design: c.models.design, extract_a: c.models.a, extract_b: c.models.b, judge: c.models.judge, temperature_a: c.temps.a, temperature_b: c.temps.b };
    const pin = {
      schema_sha256: await sha256hex(canon(schema)),
      prompts_sha256: await sha256hex(canon(PROMPTS)),
      models
    };
    pin.pin_sha256 = await sha256hex(canon(pin));
    return pin;
  }

  const onSchemaInput = debounce(async () => {
    let obj = null, err = null;
    try { obj = JSON.parse($("schema").value); err = validateSchema(obj); }
    catch (e) { err = "Not valid JSON: " + e.message; }
    S.schemaError = err;
    if (err) { S.schema = null; S.pin = null; setStatus("schemaStatus", err, "err"); }
    else {
      S.schema = obj;
      S.pin = await computePin(obj);
      setStatus("schemaStatus", "Schema valid: " + fieldPaths(obj).length + " compared fields plus the source quote.", "ok");
    }
    renderPin();
    updateGates();
  }, 200);

  function renderPin() {
    const el = $("pinView");
    clear(el);
    if (!S.pin) { el.appendChild(h("dt", null, "pin")); el.appendChild(h("dd", null, "fix the schema to compute the pin")); return; }
    const p = S.pin;
    const rows = [
      ["protocol", PROTOCOL],
      ["schema_sha256", p.schema_sha256],
      ["prompts_sha256", p.prompts_sha256],
      ["models", [p.models.provider, "design " + p.models.design, "A " + p.models.extract_a + " @ " + p.models.temperature_a, "B " + p.models.extract_b + " @ " + p.models.temperature_b, "judge " + p.models.judge].join("  |  ")],
      ["pin_sha256", p.pin_sha256]
    ];
    for (const [k, v] of rows) { el.appendChild(h("dt", null, k)); el.appendChild(h("dd", null, v)); }
  }

  function currentQueries() {
    return $("queries").value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  }

  /* ------------------------------------------------------------------ */
  /* Step 4: papers                                                     */
  /* ------------------------------------------------------------------ */

  async function getJSON(url, signal) {
    let res;
    try { res = await fetch(url, { signal, headers: { accept: "application/json" } }); }
    catch (e) { if (isAbort(e)) throw e; throw new PErr("Could not reach " + new URL(url).host + " (network or CORS)."); }
    if (!res.ok) throw new PErr("HTTP " + res.status + " from " + new URL(url).host);
    try { return await res.json(); } catch (e) { throw new PErr(new URL(url).host + " returned invalid JSON."); }
  }

  function invertAbstract(inv) {
    if (!inv || typeof inv !== "object") return "";
    const words = [];
    for (const [w, positions] of Object.entries(inv)) {
      if (!Array.isArray(positions)) continue;
      for (const p of positions) if (Number.isInteger(p) && p >= 0 && p < 20000) words[p] = w;
    }
    return words.filter((w) => w !== undefined).join(" ").replace(/\s+/g, " ").trim();
  }

  function cleanDoi(d) {
    if (!d) return null;
    return String(d).trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "") || null;
  }

  function mapOpenAlex(w) {
    const pmcRaw = w.ids && w.ids.pmcid;
    const pmcMatch = pmcRaw ? String(pmcRaw).match(/PMC\d+/i) : null;
    const pmcid = pmcMatch ? pmcMatch[0].toUpperCase() : null;
    const auth = (w.authorships || []).map((a) => a.author && a.author.display_name).filter(Boolean);
    const loc = w.primary_location || {};
    const doi = cleanDoi(w.doi);
    return {
      uid: "oa:" + String(w.id || "").replace("https://openalex.org/", ""),
      title: stripTags(w.display_name || w.title || "Untitled"),
      year: w.publication_year || null,
      authors: auth.slice(0, 3).join(", ") + (auth.length > 3 ? ", et al." : ""),
      venue: (loc.source && loc.source.display_name) || "",
      doi,
      pmcid,
      openalex_id: w.id ? String(w.id).replace("https://openalex.org/", "") : null,
      url: doi ? "https://doi.org/" + doi : (loc.landing_page_url || w.id || ""),
      abstract: invertAbstract(w.abstract_inverted_index),
      sources: ["OpenAlex"],
      fulltext: pmcid ? "maybe" : null
    };
  }

  function mapEPMC(r) {
    const pmcid = r.pmcid ? String(r.pmcid).toUpperCase() : null;
    const doi = cleanDoi(r.doi);
    const oa = r.isOpenAccess === "Y" && r.inEPMC === "Y" && pmcid;
    return {
      uid: "epmc:" + (r.source || "") + ":" + r.id,
      title: stripTags(r.title || "Untitled").replace(/\.$/, ""),
      year: r.pubYear ? parseInt(r.pubYear, 10) : null,
      authors: (r.authorString || "").split(", ").slice(0, 3).join(", ") + ((r.authorString || "").split(", ").length > 3 ? ", et al." : ""),
      venue: (r.journalInfo && r.journalInfo.journal && r.journalInfo.journal.title) || "",
      doi,
      pmcid,
      pmid: r.pmid || null,
      openalex_id: null,
      url: pmcid ? "https://europepmc.org/article/PMC/" + pmcid : doi ? "https://doi.org/" + doi : "https://europepmc.org/article/" + (r.source || "MED") + "/" + r.id,
      abstract: stripTags(r.abstractText || ""),
      sources: ["Europe PMC"],
      fulltext: oa ? "yes" : (pmcid ? "maybe" : null)
    };
  }

  async function searchOpenAlex(q, n, signal) {
    const url = "https://api.openalex.org/works?search=" + encodeURIComponent(q) + "&filter=is_oa:true&per-page=" + n;
    const j = await getJSON(url, signal);
    return (j.results || []).map(mapOpenAlex);
  }

  async function searchEPMC(q, n, signal) {
    const url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=" + encodeURIComponent(q) + "&format=json&resultType=core&pageSize=" + n;
    const j = await getJSON(url, signal);
    return ((j.resultList && j.resultList.result) || []).map(mapEPMC);
  }

  function paperKey(p) {
    if (p.doi) return "doi:" + p.doi.toLowerCase();
    if (p.pmcid) return "pmc:" + p.pmcid;
    return "t:" + (p.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 80);
  }

  function mergePaper(into, p) {
    for (const k of ["year", "authors", "venue", "doi", "pmcid", "pmid", "openalex_id", "url"]) if (!into[k] && p[k]) into[k] = p[k];
    if ((p.abstract || "").length > (into.abstract || "").length) into.abstract = p.abstract;
    for (const s of p.sources) if (!into.sources.includes(s)) into.sources.push(s);
    if (p.fulltext === "yes" || (p.fulltext === "maybe" && !into.fulltext)) into.fulltext = p.fulltext;
  }

  function mergeAll(lists) {
    const out = [], idx = new Map();
    const maxLen = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < maxLen; i++) {
      for (const l of lists) {
        const p = l[i];
        if (!p) continue;
        const k = paperKey(p);
        // Also match on title so preprint and journal records of one paper merge.
        const tk = "t:" + (p.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 80);
        const hit = idx.get(k) || idx.get(tk);
        if (hit) { mergePaper(hit, p); if (!idx.has(k)) idx.set(k, hit); continue; }
        const copy = clone(p);
        idx.set(k, copy); idx.set(tk, copy);
        out.push(copy);
      }
    }
    return out;
  }

  const readable = (p) => p.fulltext === "yes" || p.fulltext === "maybe" || p.fulltext === "excerpt" || (p.abstract || "").length >= 100;

  async function runSearch() {
    showErr("searchErr", "");
    const queries = currentQueries();
    if (!S.schema) { showErr("searchErr", "Fix or create the design in step 3 first."); return false; }
    if (!queries.length) { showErr("searchErr", "Add at least one search query in step 3."); return false; }
    const n = parseInt($("perQuery").value, 10) || 8;
    const btn = $("searchBtn");
    btn.disabled = true; btn.classList.add("spin");
    try {
      let papers;
      if (S.demo) {
        log("searchLog", "Demo: using two pre-selected papers instead of a live search");
        await sleep(500);
        papers = clone(DEMO.papers);
      } else {
        const lists = [];
        await Promise.all(queries.map(async (q) => {
          const [oa, ep] = await Promise.allSettled([searchOpenAlex(q, n), searchEPMC(q, n)]);
          if (oa.status === "fulfilled") { lists.push(oa.value); log("searchLog", "OpenAlex \"" + q + "\": " + oa.value.length + " open-access works"); }
          else log("searchLog", "OpenAlex \"" + q + "\": " + oa.reason.message, "err");
          if (ep.status === "fulfilled") { lists.push(ep.value); log("searchLog", "Europe PMC \"" + q + "\": " + ep.value.length + " works"); }
          else log("searchLog", "Europe PMC \"" + q + "\": " + ep.reason.message, "err");
        }));
        papers = mergeAll(lists).slice(0, 40);
        if (!papers.length) throw new PErr("No papers came back. Try broader queries in step 3, or check the log above for network errors.");
      }
      // Readable papers first, full text first among those, otherwise keep search order.
      const rank = (p) => (p.fulltext === "yes" || p.fulltext === "excerpt" ? 0 : readable(p) ? 1 : 2);
      papers = papers.map((p, i) => ({ p, i })).sort((x, y) => rank(x.p) - rank(y.p) || x.i - y.i).map((x) => x.p);
      const keep = S.papers.filter((p) => p.manual);
      S.papers = keep.concat(papers.filter((p) => !keep.some((k) => paperKey(k) === paperKey(p))));
      selectFirst(5);
      log("searchLog", S.papers.length + " papers after merging duplicates", "ok");
      renderPapers();
      return true;
    } catch (e) {
      if (!isAbort(e)) { showErr("searchErr", e.message); log("searchLog", e.message, "err"); }
      return false;
    } finally { btn.disabled = false; btn.classList.remove("spin"); updateGates(); }
  }

  async function addById() {
    showErr("searchErr", "");
    const raw = $("addId").value.trim();
    if (!raw) return;
    if (S.demo) { showErr("searchErr", "Adding papers is turned off in demo mode. Leave the demo to search live."); return; }
    const btn = $("addIdBtn");
    btn.disabled = true;
    try {
      let lists = [];
      if (/^PMC\d+$/i.test(raw)) {
        const ep = await searchEPMC("PMCID:" + raw.toUpperCase(), 1);
        lists.push(ep);
      } else {
        const doi = cleanDoi(raw);
        if (!/^10\.\d{4,9}\/\S+$/.test(doi || "")) throw new PErr("That does not look like a DOI (10.xxxx/...) or a PMCID (PMC1234567).");
        const [oa, ep] = await Promise.allSettled([
          getJSON("https://api.openalex.org/works/https://doi.org/" + encodeURI(doi)).then((w) => [mapOpenAlex(w)]),
          searchEPMC("DOI:\"" + doi + "\"", 1)
        ]);
        if (oa.status === "fulfilled") lists.push(oa.value);
        if (ep.status === "fulfilled") lists.push(ep.value);
      }
      const found = mergeAll(lists);
      if (!found.length) throw new PErr("No record found for " + raw + " in OpenAlex or Europe PMC.");
      const p = found[0];
      p.manual = true; p.selected = readable(p);
      S.papers = [p].concat(S.papers.filter((x) => paperKey(x) !== paperKey(p)));
      log("searchLog", "Added " + p.title, "ok");
      if (!readable(p)) log("searchLog", "This paper has no abstract or open full text in either index, so the readers cannot read it", "err");
      $("addId").value = "";
      renderPapers();
    } catch (e) {
      showErr("searchErr", e.message);
    } finally { btn.disabled = false; updateGates(); }
  }

  function selectFirst(n) {
    let c = 0;
    for (const p of S.papers) { p.selected = readable(p) && c < n; if (p.selected) c++; }
  }

  function textKindLabel(p) {
    if (p.fulltext === "yes") return ["full text", "full"];
    if (p.fulltext === "excerpt") return ["full-text excerpt", "full"];
    if (p.fulltext === "maybe") return ["may have full text", ""];
    if ((p.abstract || "").length >= 100) return ["abstract only", ""];
    return ["no readable text", "red"];
  }

  function renderPapers() {
    const list = $("paperList");
    clear(list);
    $("paperTools").hidden = !S.papers.length;
    for (const p of S.papers) {
      const ok = readable(p);
      const [kind, cls] = textKindLabel(p);
      const cb = h("input", { type: "checkbox", id: "p_" + p.uid.replace(/[^a-z0-9]/gi, "_"), "aria-label": "Process " + p.title });
      cb.checked = !!p.selected; cb.disabled = !ok || S.extracting;
      cb.addEventListener("change", () => { p.selected = cb.checked; renderCount(); updateGates(); });
      const meta = h("p", { class: "m" },
        h("span", { class: "tag " + cls }, kind),
        p.year ? h("span", null, String(p.year)) : null,
        p.authors ? h("span", null, p.authors) : null,
        p.venue ? h("span", null, p.venue) : null,
        h("span", null, p.sources.join(" + ")),
        p.pmcid ? h("span", null, p.pmcid) : null,
        p.url ? h("a", { href: p.url, target: "_blank", rel: "noopener" }, p.doi ? "doi:" + p.doi : "source") : null
      );
      list.appendChild(h("li", { class: "paper", dataset: { disabled: String(!ok) } },
        cb,
        h("div", null, h("label", { for: cb.id, class: "t" }, p.title), meta)
      ));
    }
    renderCount();
  }

  function renderCount() {
    const sel = S.papers.filter((p) => p.selected);
    const ft = sel.filter((p) => p.fulltext === "yes" || p.fulltext === "excerpt").length;
    $("selCount").textContent = sel.length + " of " + S.papers.length + " selected" + (sel.length ? " (" + ft + " with full text, " + (sel.length - ft) + " abstract or possible full text)" : "");
    renderEstimate();
  }

  function renderEstimate() {
    const sel = S.papers.filter((p) => p.selected);
    const el = $("estimate");
    if (!sel.length) { el.textContent = ""; return; }
    if (S.demo) { el.textContent = sel.length + " papers selected. In demo mode the readers' answers are pre-recorded, so this run is free."; return; }
    const c = cfg();
    const promptChars = 3500 + JSON.stringify(S.schema || {}).length;
    let inA = 0;
    for (const p of sel) {
      const textChars = p.fulltext === "yes" ? TEXT_BUDGET * 0.8 : p.fulltext === "maybe" ? TEXT_BUDGET * 0.5 : (p.abstract || "").length + 300;
      inA += (promptChars + textChars) / 4;
    }
    const outEach = 1800 * sel.length;
    const pa = priceFor(c.models.a), pb = priceFor(c.models.b);
    let cost = null;
    if (pa && pb) cost = (inA * pa[0] + outEach * pa[1] + inA * pb[0] + outEach * pb[1]) / 1e6;
    el.textContent = "Rough estimate for both readers: about " + fmtInt(inA * 2) + " input and " + fmtInt(outEach * 2) + " output tokens" +
      (cost !== null ? ", around " + fmtUsd(cost) + " at list prices" : " (no price on file for these models)") +
      ". Actual usage is counted in the bar at the top.";
  }

  /* ------------------------------------------------------------------ */
  /* Full text from Europe PMC                                          */
  /* ------------------------------------------------------------------ */

  function classifySection(title, type) {
    const t = ((title || "") + " " + (type || "")).toLowerCase();
    if (/result|finding|outcome/.test(t)) return { kind: "results", pri: 2 };
    if (/method|material|experimental|procedure|participant|study design|data source|statistical|population|sample/.test(t)) return { kind: "methods", pri: 4 };
    if (/conclusion/.test(t)) return { kind: "conclusion", pri: 5 };
    if (/discussion|limitation/.test(t)) return { kind: "discussion", pri: 6 };
    if (/introduction|background/.test(t)) return { kind: "intro", pri: 8 };
    if (/supplement|acknowledg|funding|conflict|author contrib|abbreviation|data availability|ethic/.test(t)) return { kind: "back", pri: 99 };
    return { kind: "other", pri: 7 };
  }

  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

  function tableText(tw) {
    const label = norm((tw.querySelector("label") || {}).textContent);
    const caption = norm((tw.querySelector("caption") || {}).textContent);
    const rows = Array.from(tw.querySelectorAll("tr")).map((tr) => Array.from(tr.children).map((td) => norm(td.textContent)).join(" | "));
    const foot = norm((tw.querySelector("table-wrap-foot") || {}).textContent);
    return [label + (caption ? ": " + caption : ""), rows.join("\n"), foot].filter(Boolean).join("\n");
  }

  function jatsToText(xml, budget) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new PErr("The full-text XML could not be parsed.");
    const title = norm((doc.querySelector("article-title") || {}).textContent);
    const abs = doc.querySelector("abstract");
    const pieces = [];
    if (abs) pieces.push({ head: "Abstract", text: norm(abs.textContent), pri: 1 });
    const body = doc.querySelector("body");
    if (body) {
      const tables = Array.from(body.querySelectorAll("table-wrap"));
      tables.forEach((tw) => pieces.push({ head: "Table", text: tableText(tw), pri: 3 }));
      const figs = Array.from(body.querySelectorAll("fig"));
      figs.forEach((f) => {
        const t = norm((f.querySelector("label") || {}).textContent) + ": " + norm((f.querySelector("caption") || {}).textContent);
        pieces.push({ head: "Figure", text: t, pri: 5 });
      });
      const top = Array.from(body.children).filter((c) => c.tagName === "sec");
      if (top.length) {
        for (const sec of top) {
          const st = norm((Array.from(sec.children).find((c) => c.tagName === "title") || {}).textContent);
          const cls = classifySection(st, sec.getAttribute("sec-type"));
          if (cls.pri >= 99) continue;
          const copy = sec.cloneNode(true);
          copy.querySelectorAll("table-wrap, fig, ref-list").forEach((n) => { if (n.parentNode) n.parentNode.removeChild(n); });
          const own = Array.from(copy.children).find((c) => c.tagName === "title");
          if (own) copy.removeChild(own);
          const tt = Array.from(copy.querySelectorAll("title"));
          tt.forEach((t) => { t.textContent = "\n" + norm(t.textContent) + ". "; });
          const text = norm(copy.textContent);
          if (text) pieces.push({ head: st || cls.kind, text, pri: cls.pri });
        }
      } else {
        const copy = body.cloneNode(true);
        copy.querySelectorAll("table-wrap, fig").forEach((n) => n.parentNode.removeChild(n));
        pieces.push({ head: "Body", text: norm(copy.textContent), pri: 4 });
      }
    }
    const sorted = pieces.map((p, i) => Object.assign(p, { i })).sort((a, b) => a.pri - b.pri || a.i - b.i);
    let out = title ? title + "\n\n" : "", truncated = false;
    for (const p of sorted) {
      if (!p.text) continue;
      const block = "## " + p.head + "\n" + p.text + "\n\n";
      if (out.length + block.length > budget) {
        const room = budget - out.length;
        if (room > 600) out += block.slice(0, room) + " [truncated]\n";
        truncated = true;
        break;
      }
      out += block;
    }
    const bodyChars = body ? norm(body.textContent).length : 0;
    return { text: out.trim(), truncated, hasBody: bodyChars > 2000 };
  }

  async function getPaperText(p, signal) {
    if (S.demo) { await sleep(300, signal); return { text: p.demoText, kind: "full_text_excerpt", note: "verbatim excerpt from the arXiv full text" }; }
    if (p.pmcid && (p.fulltext === "yes" || p.fulltext === "maybe")) {
      try {
        const url = "https://www.ebi.ac.uk/europepmc/webservices/rest/" + encodeURIComponent(p.pmcid) + "/fullTextXML";
        const res = await fetch(url, { signal });
        if (res.ok) {
          const xml = await res.text();
          const r = jatsToText(xml, TEXT_BUDGET);
          if (r.hasBody && r.text.length > 1500) return { text: r.text, kind: "full_text", note: r.truncated ? "truncated to " + fmtInt(TEXT_BUDGET) + " characters, Results, tables and Methods first" : "" };
        }
      } catch (e) { if (isAbort(e)) throw e; }
    }
    if ((p.abstract || "").length >= 80) return { text: p.title + "\n\n## Abstract\n" + p.abstract, kind: "abstract_only", note: "" };
    throw new PErr("No abstract or open full text available.");
  }

  /* ------------------------------------------------------------------ */
  /* Step 5: extraction                                                 */
  /* ------------------------------------------------------------------ */

  function normalizeClaims(data) {
    let claims = Array.isArray(data) ? data : (data && Array.isArray(data.claims) ? data.claims : null);
    if (!claims) throw new PErr("The reply has no \"claims\" array.");
    return claims.filter((c) => c && typeof c === "object" && !Array.isArray(c)).slice(0, 15).map((c) => {
      const out = Object.assign({}, c);
      if (!out.effect || typeof out.effect !== "object") out.effect = { value: null, lower: null, upper: null, unit: null, interval_type: null };
      if (!out.topic || typeof out.topic !== "object") out.topic = {};
      if (!out.source_pointer || typeof out.source_pointer !== "object") out.source_pointer = { section: null, quote: typeof c.quote === "string" ? c.quote : null };
      return out;
    });
  }

  function paperMeta(p) {
    return [
      "Title: " + p.title,
      p.year ? "Year: " + p.year : null,
      p.authors ? "Authors: " + p.authors : null,
      p.venue ? "Venue: " + p.venue : null,
      p.doi ? "DOI: " + p.doi : null
    ].filter(Boolean).join("\n");
  }

  async function readPaper(p, run, which, signal) {
    const R = S.run;
    const model = R.models["extract_" + which];
    const temperature = R.models["temperature_" + which];
    const user = fill(PROMPTS.extract_user, {
      schema: JSON.stringify({ core: R.schema.core, topic_fields: R.schema.topic_fields || {} }, null, 1),
      meta: paperMeta(p),
      text_kind: run.text_kind === "abstract_only" ? "abstract only; record only what the abstract states" : run.text_kind === "full_text" ? "full text (may be truncated)" : "full-text excerpt",
      max_claims: run.text_kind === "abstract_only" ? 6 : 12,
      claim_template: claimTemplate(R.schema),
      text: run.text
    });
    const { data } = await llmJSON({
      kind: "extract", ctx: { uid: p.uid, reader: which }, cfg: R.cfg, model, temperature,
      system: PROMPTS.extract_system, user, maxTokens: 6000, signal,
      onRetry: (m) => log("extractLog", "Reader " + which.toUpperCase() + ", " + shortTitle(p) + ": " + m)
    });
    return { model, temperature, claims: normalizeClaims(data) };
  }

  const shortTitle = (p) => (p.title.length > 60 ? p.title.slice(0, 57) + "..." : p.title);

  function progRow(p) {
    const id = "pr_" + p.uid.replace(/[^a-z0-9]/gi, "_");
    let tr = $(id);
    if (!tr) {
      tr = h("tr", { id },
        h("td", { class: "title" }, shortTitle(p)),
        h("td", { class: "s", dataset: { k: "text" } }, "queued"),
        h("td", { class: "s", dataset: { k: "a" } }, "queued"),
        h("td", { class: "s", dataset: { k: "b" } }, "queued"));
      $("progBody").appendChild(tr);
    }
    return tr;
  }
  function setCell(p, k, text, cls) {
    const td = progRow(p).querySelector('[data-k="' + k + '"]');
    td.textContent = text;
    td.className = "s" + (cls ? " " + cls : "");
  }

  async function processPaper(p, signal) {
    const run = S.runs[p.uid] = { uid: p.uid, status: "running", a: null, b: null, errA: null, errB: null, judge: {} };
    try {
      setCell(p, "text", "fetching", "run");
      const t = await getPaperText(p, signal);
      run.text = t.text; run.text_kind = t.kind; run.text_note = t.note;
      run.text_sha256 = await sha256hex(t.text);
      setCell(p, "text", (t.kind === "abstract_only" ? "abstract" : t.kind === "full_text" ? "full text" : "excerpt") + ", " + fmtInt(t.text.length) + " ch", "done");
    } catch (e) {
      run.status = "failed"; run.error = isAbort(e) ? "stopped" : e.message;
      setCell(p, "text", isAbort(e) ? "stopped" : "failed", "fail");
      setCell(p, "a", "skipped", ""); setCell(p, "b", "skipped", "");
      if (!isAbort(e)) log("extractLog", shortTitle(p) + ": " + e.message, "err");
      return;
    }
    const one = async (which) => {
      setCell(p, which, "reading", "run");
      try {
        const r = await readPaper(p, run, which, signal);
        run[which] = r;
        setCell(p, which, r.claims.length + " claims", "done");
      } catch (e) {
        run["err" + which.toUpperCase()] = isAbort(e) ? "stopped" : e.message;
        setCell(p, which, isAbort(e) ? "stopped" : "failed", "fail");
        if (!isAbort(e)) log("extractLog", "Reader " + which.toUpperCase() + ", " + shortTitle(p) + ": " + e.message, "err");
        if (e.fatal && S.ctrl) S.ctrl.abort();
        if (e.fatal) showErr("extractErr", e.message);
      }
    };
    await Promise.all([one("a"), one("b")]);
    if (run.a && run.b) {
      run.status = "done";
      run.created_at = new Date().toISOString();
      run.agreement = compareRun(run, S.run.schema);
      log("extractLog", shortTitle(p) + ": compared " + run.agreement.pairs.length + " matched claims", "ok");
    } else run.status = "failed";
  }

  async function runExtraction(opts) {
    showErr("extractErr", "");
    if (S.extracting) return false;
    const retry = opts && opts.retry;
    let papers = S.papers.filter((p) => p.selected);
    if (retry) papers = papers.filter((p) => !S.runs[p.uid] || S.runs[p.uid].status !== "done");
    if (!papers.length) { showErr("extractErr", "Select at least one paper in step 4."); return false; }
    if (!S.schema || !S.pin) { showErr("extractErr", "The schema in step 3 is not valid."); return false; }
    const c = cfg();
    if (!S.demo) {
      try { checkCfg(c, ["a", "b"]); } catch (e) { showErr("extractErr", e.message); return false; }
    }
    if (!retry || !S.run) {
      S.run = {
        pin: clone(S.pin), schema: clone(S.schema), cfg: c, models: clone(S.pin.models),
        topic: $("topic").value.trim(), queries: currentQueries(), started_at: new Date().toISOString()
      };
      S.runs = {};
      clear($("progBody"));
      S.bundle = null;
    } else {
      S.run.cfg = c; // fresh key if the user fixed it; the pin stays as recorded
    }
    S.extracting = true;
    S.ctrl = new AbortController();
    $("progTable").hidden = false;
    $("stopBtn").hidden = false;
    $("extractBtn").disabled = true;
    $("extractBtn").classList.add("spin");
    renderPapers();
    log("extractLog", "Running reader A (" + S.run.models.extract_a + ", temperature " + S.run.models.temperature_a + ") and reader B (" + S.run.models.extract_b + ", temperature " + S.run.models.temperature_b + ") on " + papers.length + " papers");
    papers.forEach(progRow);
    try {
      await pool(papers, 2, (p) => processPaper(p, S.ctrl.signal));
    } finally {
      S.extracting = false;
      $("stopBtn").hidden = true;
      $("extractBtn").disabled = false;
      $("extractBtn").classList.remove("spin");
      renderPapers();
    }
    const done = Object.values(S.runs).filter((r) => r.status === "done").length;
    const failed = Object.values(S.runs).filter((r) => r.status !== "done").length;
    log("extractLog", done + " papers read by both readers" + (failed ? ", " + failed + " incomplete" : ""), done ? "ok" : "err");
    $("extractBtn").textContent = failed && done ? "Retry incomplete papers" : "Run both readers";
    $("extractBtn").dataset.retry = failed && done ? "1" : "";
    renderAgreement();
    await rebuildBundle();
    updateGates();
    return done > 0;
  }

  /* ------------------------------------------------------------------ */
  /* Step 6: deterministic agreement                                    */
  /* ------------------------------------------------------------------ */

  const EMPTY = new Set(["", "null", "none", "n/a", "na", "not stated", "not reported", "not given", "unknown", "unclear", "not specified"]);
  const STOP = new Set("a an the of in on for to and or with by at from as is are was were be per vs versus than that this these those its their into over under".split(" "));
  const SYN = [[/\bci\b/g, "confidence interval"], [/\bsd\b/g, "standard deviation"], [/\biqr\b/g, "interquartile range"], [/\brct\b/g, "randomized controlled trial"], [/randomised/g, "randomized"], [/\bml\b/g, "ml"], [/\bnot applicable\b/g, "not_applicable"]];

  function isEmpty(v) {
    if (v === null || v === undefined) return true;
    if (typeof v === "string") return EMPTY.has(v.trim().toLowerCase());
    if (Array.isArray(v)) return v.length === 0;
    return false;
  }
  function valStr(v) {
    if (Array.isArray(v)) return v.map(valStr).join("; ");
    if (v && typeof v === "object") return canon(v);
    return String(v);
  }
  function normStr(v) {
    let s = valStr(v).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
    s = s.replace(/[‐-―−]/g, "-").replace(/_/g, " ");
    for (const [re, rep] of SYN) s = s.replace(re, rep);
    return s.replace(/[^a-z0-9.%-]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function stem(w) {
    if (w.length > 5 && w.endsWith("ly")) w = w.slice(0, -2);
    if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
    return w;
  }
  function tokens(v) {
    return new Set(normStr(v).split(/[\s-]+/).map((w) => w.replace(/^\.+|\.+$/g, "")).filter((w) => w && !STOP.has(w)).map(stem));
  }
  function toNum(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    const s = v.trim().replace(/,/g, "").replace(/−/g, "-");
    return /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s) ? parseFloat(s) : null;
  }
  const numTokens = (set) => new Set([...set].filter((t) => /\d/.test(t)));

  function compareValues(a, b) {
    const ea = isEmpty(a), eb = isEmpty(b);
    if (ea && eb) return "empty";
    if (ea || eb) return "disagree";
    const na = toNum(a), nb = toNum(b);
    if (na !== null && nb !== null) {
      if (na === nb) return "agree";
      const tol = 0.01 * Math.max(Math.abs(na), Math.abs(nb));
      return Math.abs(na - nb) <= tol ? "agree" : "disagree";
    }
    const sa = normStr(a), sb = normStr(b);
    if (sa === sb) return "agree";
    const ta = tokens(a), tb = tokens(b);
    const na2 = numTokens(ta), nb2 = numTokens(tb);
    if ((na2.size || nb2.size) && (na2.size !== nb2.size || [...na2].some((t) => !nb2.has(t)))) return "disagree";
    if (!ta.size || !tb.size) return "disagree";
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter++;
    const contain = inter / Math.min(ta.size, tb.size);
    const dice = (2 * inter) / (ta.size + tb.size);
    return contain >= 0.8 || dice >= 0.75 ? "close" : "disagree";
  }

  function alnum(s) {
    return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function checkQuote(quote, srcAlnum) {
    if (typeof quote !== "string" || !quote.trim()) return { status: "empty" };
    const q = alnum(quote);
    if (q.length < 8) return { status: "missing", note: "too short to verify" };
    if (srcAlnum.includes(q)) return { status: "verified" };
    const parts = quote.split(/\s*(?:\[\s*(?:\.\.\.|…)\s*\]|\.\.\.|…)\s*/).map(alnum).filter((x) => x.length >= 8);
    if (parts.length > 1 && parts.every((p) => srcAlnum.includes(p))) return { status: "verified", note: "elided" };
    const words = quote.split(/\s+/).filter(Boolean);
    if (words.length >= 6) {
      let hit = 0, tot = 0;
      for (let i = 0; i + 4 <= words.length; i++) { tot++; if (srcAlnum.includes(alnum(words.slice(i, i + 4).join(" ")))) hit++; }
      if (tot && hit / tot >= 0.8) return { status: "near", note: "close to the source text but not exact" };
    }
    return { status: "missing" };
  }

  function dice(a, b) {
    if (!a.size || !b.size) return 0;
    let i = 0;
    for (const t of a) if (b.has(t)) i++;
    return (2 * i) / (a.size + b.size);
  }
  function numEq(x, y) {
    const a = toNum(x), b = toNum(y);
    if (a === null || b === null) return false;
    return Math.abs(a - b) <= 0.01 * Math.max(Math.abs(a), Math.abs(b)) || a === b;
  }
  function claimSim(a, b) {
    const sig = (c) => tokens([c.subject, c.outcome, c.measure].map((x) => (isEmpty(x) ? "" : valStr(x))).join(" "));
    let s = dice(sig(a), sig(b));
    const ea = a.effect || {}, eb = b.effect || {};
    if (numEq(ea.value, eb.value)) s += 0.4;
    if (numEq(ea.lower, eb.lower) && numEq(ea.upper, eb.upper)) s += 0.2;
    const qa = (a.source_pointer || {}).quote, qb = (b.source_pointer || {}).quote;
    if (qa && qb) s += 0.4 * dice(tokens(qa), tokens(qb));
    return s;
  }

  function compareRun(run, schema) {
    const A = run.a.claims, B = run.b.claims;
    const srcAlnum = alnum(run.text);
    const cand = [];
    A.forEach((a, i) => B.forEach((b, j) => cand.push({ i, j, s: claimSim(a, b) })));
    cand.sort((x, y) => y.s - x.s);
    const usedA = new Set(), usedB = new Set(), pairs = [];
    for (const c of cand) {
      if (c.s < 0.45 || usedA.has(c.i) || usedB.has(c.j)) continue;
      usedA.add(c.i); usedB.add(c.j);
      pairs.push(c);
    }
    pairs.sort((x, y) => x.i - y.i);
    const paths = fieldPaths(schema);
    const out = pairs.map((c) => {
      const a = A[c.i], b = B[c.j];
      const fields = paths.map((path) => {
        const va = getPath(a, path), vb = getPath(b, path);
        return { path, a: va === undefined ? null : va, b: vb === undefined ? null : vb, status: compareValues(va, vb) };
      });
      return {
        key: c.i + ":" + c.j, ai: c.i, bi: c.j, similarity: Math.round(c.s * 1000) / 1000, fields,
        quoteA: checkQuote((a.source_pointer || {}).quote, srcAlnum),
        quoteB: checkQuote((b.source_pointer || {}).quote, srcAlnum)
      };
    });
    const onlyA = A.map((_, i) => i).filter((i) => !usedA.has(i));
    const onlyB = B.map((_, j) => j).filter((j) => !usedB.has(j));
    const soloQuotes = {
      a: Object.fromEntries(onlyA.map((i) => [i, checkQuote((A[i].source_pointer || {}).quote, srcAlnum)])),
      b: Object.fromEntries(onlyB.map((j) => [j, checkQuote((B[j].source_pointer || {}).quote, srcAlnum)]))
    };
    return { pairs: out, onlyA, onlyB, soloQuotes };
  }

  /* Combine the deterministic comparison with any judge decisions. */
  function resolvePair(run, pair) {
    const j = run.judge[pair.key];
    const decisions = (j && j.decisions) || {};
    const claim = {}, judged = {}, disputed = [];
    for (const f of pair.fields) {
      if (f.status === "agree" || f.status === "close") setPath(claim, f.path, f.a);
      else if (f.status === "empty") setPath(claim, f.path, null);
      else {
        const d = decisions[f.path];
        if (d && d.basis !== "neither") {
          setPath(claim, f.path, d.value === undefined ? null : d.value);
          judged[f.path] = { basis: d.basis, quote: d.quote || "", reason: d.reason || "", quote_check: d.quote_check || null };
        } else disputed.push(f.path);
      }
    }
    const a = run.a.claims[pair.ai], b = run.b.claims[pair.bi];
    let pointer = null;
    if (pair.quoteA.status === "verified") pointer = { section: (a.source_pointer || {}).section || null, quote: a.source_pointer.quote, reader: "A" };
    else if (pair.quoteB.status === "verified") pointer = { section: (b.source_pointer || {}).section || null, quote: b.source_pointer.quote, reader: "B" };
    let status;
    if (disputed.length) status = "flagged";
    else if (!pointer) status = "flagged";
    else status = Object.keys(judged).length ? "judged" : "accepted";
    const reason = disputed.length ? disputed.length + (disputed.length === 1 ? " field disputed" : " fields disputed") : !pointer ? "no verified quote" : status;
    return { claim, judged, disputed, pointer, status, reason, judgeNote: j ? j.note : null, judgeModel: j ? j.model : null };
  }

  function runSummary(run) {
    const ag = run.agreement;
    let fields = 0, agreeing = 0, accepted = 0, flagged = 0, qv = 0, qt = 0;
    for (const pair of ag.pairs) {
      for (const f of pair.fields) { fields++; if (f.status !== "disagree") agreeing++; }
      const r = resolvePair(run, pair);
      if (r.status === "flagged") flagged++; else accepted++;
      for (const q of [pair.quoteA, pair.quoteB]) { if (q.status !== "empty") { qt++; if (q.status === "verified") qv++; } }
    }
    for (const q of [...Object.values(ag.soloQuotes.a), ...Object.values(ag.soloQuotes.b)]) { if (q.status !== "empty") { qt++; if (q.status === "verified") qv++; } }
    flagged += ag.onlyA.length + ag.onlyB.length;
    return { claims_a: run.a.claims.length, claims_b: run.b.claims.length, matched: ag.pairs.length, only_a: ag.onlyA.length, only_b: ag.onlyB.length, fields_compared: fields, fields_agreeing: agreeing, quotes_verified: qv, quotes_checked: qt, accepted, flagged };
  }

  function fmtVal(v) {
    if (isEmpty(v)) return null;
    return valStr(v);
  }

  function claimHeadline(c) {
    const e = c.effect || {};
    let num = "";
    if (!isEmpty(e.value)) num = valStr(e.value);
    if (!isEmpty(e.lower) || !isEmpty(e.upper)) num += (num ? " " : "") + "[" + (isEmpty(e.lower) ? "?" : valStr(e.lower)) + " to " + (isEmpty(e.upper) ? "?" : valStr(e.upper)) + "]";
    if (num && !isEmpty(e.unit)) num += " " + valStr(e.unit);
    const what = !isEmpty(c.outcome) ? valStr(c.outcome) : !isEmpty(c.measure) ? valStr(c.measure) : "claim";
    return { what: what + (num ? ": " + num : ""), sub: !isEmpty(c.subject) ? valStr(c.subject) : "" };
  }

  function quoteBlock(who, c, q) {
    const quote = (c.source_pointer || {}).quote;
    const sec = (c.source_pointer || {}).section;
    const label = q.status === "verified" ? "found in source" + (q.note ? " (" + q.note + ")" : "") : q.status === "near" ? "close to source, not exact" : q.status === "empty" ? "no quote given" : "not found in source";
    const cls = q.status === "verified" ? "ok" : "bad";
    return h("div", { class: "q" + (q.status === "missing" || q.status === "near" ? " missing" : "") },
      h("span", { class: "who" }, who + (sec ? ", " + valStr(sec) : ""), h("span", { class: "vs " + cls }, label)),
      quote ? h("blockquote", null, q.status === "verified" ? h("span", { class: "mark" }, quote) : quote) : null);
  }

  function renderAgreement() {
    const list = $("agreeList");
    clear(list);
    const done = S.papers.filter((p) => S.runs[p.uid] && S.runs[p.uid].status === "done");
    $("agreeTop").hidden = !done.length;
    if (!done.length) { updateGates(); return; }
    let tot = { matched: 0, accepted: 0, flagged: 0, fields: 0, agreeing: 0, qv: 0, qt: 0, judgeable: 0 };
    for (const p of done) {
      const run = S.runs[p.uid];
      const sm = runSummary(run);
      tot.matched += sm.matched; tot.accepted += sm.accepted; tot.flagged += sm.flagged;
      tot.fields += sm.fields_compared; tot.agreeing += sm.fields_agreeing; tot.qv += sm.quotes_verified; tot.qt += sm.quotes_checked;
      const sec = h("article", { class: "ppr" });
      const kindTag = run.text_kind === "abstract_only" ? h("span", { class: "tag" }, "abstract only") : h("span", { class: "tag full" }, run.text_kind === "full_text" ? "full text" : "full-text excerpt");
      sec.appendChild(h("div", { class: "ppr-h" }, h("h3", null, p.title), kindTag));
      sec.appendChild(h("p", { class: "ppr-meta" },
        h("span", null, "A " + sm.claims_a + " claims, B " + sm.claims_b),
        h("span", null, sm.matched + " matched"),
        h("span", null, sm.fields_agreeing + " of " + sm.fields_compared + " fields agree"),
        h("span", null, sm.quotes_verified + " of " + sm.quotes_checked + " quotes found in source"),
        run.text_note ? h("span", null, run.text_note) : null));

      run.agreement.pairs.forEach((pair, idx) => {
        const a = run.a.claims[pair.ai], b = run.b.claims[pair.bi];
        const r = resolvePair(run, pair);
        if (r.disputed.length && !run.judge[pair.key]) tot.judgeable++;
        const head = claimHeadline(Object.keys(r.claim).length ? Object.assign({}, a, r.claim) : a);
        const tagCls = r.status === "flagged" ? "red" : r.status === "judged" ? "solid" : "ok";
        const det = h("details", { class: "claim", dataset: { status: r.status } });
        if (r.status === "flagged") det.open = true;
        det.appendChild(h("summary", null,
          h("span", { class: "what" }, "Claim " + (idx + 1) + ". " + head.what, head.sub ? h("small", null, head.sub) : null),
          h("span", { class: "tag " + tagCls }, r.reason)));
        const inner = h("div", { class: "claim-in" });
        const tbl = h("div", { class: "ftable", role: "table", "aria-label": "Field comparison" },
          h("div", { class: "hd", role: "columnheader" }, "Field"), h("div", { class: "hd", role: "columnheader" }, "Reader A"),
          h("div", { class: "hd", role: "columnheader" }, "Reader B"), h("div", { class: "hd", role: "columnheader" }, "Result"));
        for (const f of pair.fields) {
          const judged = r.judged[f.path];
          const dis = f.status === "disagree" && !judged;
          const va = fmtVal(f.a), vb = fmtVal(f.b);
          const stLabel = judged ? "judge: " + judged.basis : { agree: "agree", close: "close match", empty: "both empty", disagree: "disputed" }[f.status];
          const stCls = judged ? "judged" : f.status;
          tbl.appendChild(h("div", { class: "fk" + (dis ? " row-dis" : "") }, f.path));
          tbl.appendChild(h("div", { class: "v" + (va === null ? " empty" : "") + (dis ? " row-dis" : ""), "data-r": "A" }, va === null ? "empty" : va));
          tbl.appendChild(h("div", { class: "v" + (vb === null ? " empty" : "") + (dis ? " row-dis" : ""), "data-r": "B" }, vb === null ? "empty" : vb));
          tbl.appendChild(h("div", { class: "st " + stCls }, stLabel));
        }
        inner.appendChild(tbl);
        inner.appendChild(h("div", { class: "quotes" }, quoteBlock("Reader A quote", a, pair.quoteA), quoteBlock("Reader B quote", b, pair.quoteB)));
        for (const [path, jd] of Object.entries(r.judged)) {
          inner.appendChild(h("div", { class: "judge-note" },
            h("span", { class: "who" }, "Judge on " + path + " (" + (r.judgeModel || "judge") + "): sided with " + jd.basis),
            jd.reason, jd.quote ? h("div", null, h("span", { class: (jd.quote_check === "verified" ? "mark" : "") }, "“" + jd.quote + "”"), jd.quote_check && jd.quote_check !== "verified" ? h("span", { class: "err-text" }, " (judge quote not found in source)") : null) : null));
        }
        const jnote = run.judge[pair.key];
        if (jnote && jnote.unresolved && jnote.unresolved.length) {
          inner.appendChild(h("div", { class: "judge-note" }, h("span", { class: "who" }, "Judge could not settle: " + jnote.unresolved.join(", ")), jnote.unresolvedReason || "Left for a person to check."));
        }
        if (r.disputed.length && !run.judge[pair.key]) {
          inner.appendChild(h("div", { class: "actions", style: "margin-top:12px" },
            h("button", { class: "btn small ghost", type: "button", onclick: (ev) => judgePair(p, pair, ev.currentTarget) }, "Ask the judge about " + r.disputed.length + (r.disputed.length === 1 ? " field" : " fields"))));
        }
        det.appendChild(inner);
        sec.appendChild(det);
      });

      const solo = (which, idxs) => idxs.forEach((i) => {
        const c = run[which].claims[i];
        const q = run.agreement.soloQuotes[which][i];
        const head = claimHeadline(c);
        sec.appendChild(h("div", { class: "solo" },
          h("span", { class: "tag red" }, "only reader " + which.toUpperCase()), " ",
          h("span", { class: "what" }, head.what), head.sub ? " (" + head.sub + ")" : "",
          h("div", { class: "quotes" }, quoteBlock("Reader " + which.toUpperCase() + " quote", c, q)),
          h("p", { class: "hint" }, "The other reader did not report this claim, so it is held back for a person to check.")));
      });
      solo("a", run.agreement.onlyA);
      solo("b", run.agreement.onlyB);
      list.appendChild(sec);
    }
    const sum = $("agreeSummary");
    clear(sum);
    const stat = (n, l) => h("span", null, h("b", null, n), l);
    sum.appendChild(stat(String(tot.accepted), "claims accepted"));
    sum.appendChild(stat(String(tot.flagged), "held for review"));
    sum.appendChild(stat(tot.fields ? Math.round((100 * tot.agreeing) / tot.fields) + "%" : "n/a", "field agreement"));
    sum.appendChild(stat(tot.qv + "/" + tot.qt, "quotes found in source"));
    const jb = $("judgeAllBtn");
    jb.disabled = !tot.judgeable || S.judging;
    jb.textContent = tot.judgeable ? "Send " + tot.judgeable + (tot.judgeable === 1 ? " disputed claim" : " disputed claims") + " to the judge" : "No disputes left for the judge";
    $("judgeHint").textContent = tot.judgeable
      ? "The judge (" + (S.demo ? "demo, pre-recorded" : S.run.models.judge) + ") sees both readings and the source text around the quotes. Claims only one reader found stay with you."
      : "Claims found by only one reader, and fields the judge could not settle, stay held for a person.";
    updateGates();
  }

  /* Judge */
  function excerptFor(run, quotes) {
    const text = run.text;
    const lower = text.toLowerCase();
    const wins = [];
    for (const q of quotes) {
      if (!q) continue;
      const probe = q.toLowerCase().slice(0, 50);
      const at = lower.indexOf(probe);
      if (at >= 0) wins.push([Math.max(0, at - 2000), Math.min(text.length, at + q.length + 2000)]);
    }
    if (!wins.length) return text.slice(0, 14000);
    wins.sort((a, b) => a[0] - b[0]);
    const merged = [wins[0]];
    for (const w of wins.slice(1)) { const l = merged[merged.length - 1]; if (w[0] <= l[1]) l[1] = Math.max(l[1], w[1]); else merged.push(w); }
    const head = text.slice(0, 1500);
    return (merged[0][0] > 1500 ? head + "\n[...]\n" : "") + merged.map((w) => text.slice(w[0], w[1])).join("\n[...]\n");
  }

  async function judgePair(p, pair, btn) {
    const run = S.runs[p.uid];
    const r = resolvePair(run, pair);
    if (!r.disputed.length) return;
    if (!S.demo) {
      try { checkCfg(S.run.cfg.key ? S.run.cfg : cfg(), ["judge"]); } catch (e) { showErr("judgeErr", e.message); return; }
    }
    if (btn) { btn.disabled = true; btn.classList.add("spin"); }
    showErr("judgeErr", "");
    const a = run.a.claims[pair.ai], b = run.b.claims[pair.bi];
    const excerpt = excerptFor(run, [(a.source_pointer || {}).quote, (b.source_pointer || {}).quote]);
    const sub = (c) => { const o = {}; for (const f of r.disputed) o[f] = getPath(c, f) ?? null; o.source_pointer = c.source_pointer; return o; };
    try {
      const c = S.run.cfg.key || S.run.cfg.provider === "compatible" ? S.run.cfg : cfg();
      log("judgeLog", "Judge on \"" + shortTitle(p) + "\": " + r.disputed.join(", "));
      const { data } = await llmJSON({
        kind: "judge", ctx: { uid: p.uid, fields: r.disputed }, cfg: c, model: S.run.models.judge, temperature: 0,
        system: PROMPTS.judge_system,
        user: fill(PROMPTS.judge_user, { title: p.title, fields: r.disputed.join(", "), a: JSON.stringify(sub(a), null, 1), b: JSON.stringify(sub(b), null, 1), excerpt }),
        maxTokens: 2000, onRetry: (m) => log("judgeLog", m)
      });
      const decs = Array.isArray(data.decisions) ? data.decisions : [];
      const srcAlnum = alnum(run.text);
      const map = {};
      const unresolved = [];
      let unresolvedReason = "";
      for (const f of r.disputed) {
        const d = decs.find((x) => x && x.field === f);
        if (!d || !["A", "B", "both"].includes(d.basis)) { unresolved.push(f); if (d && d.reason) unresolvedReason = d.reason; continue; }
        const qc = d.quote ? checkQuote(d.quote, srcAlnum).status : null;
        let value = d.value;
        if (d.basis === "A" && (value === undefined)) value = getPath(a, f);
        if (d.basis === "B" && (value === undefined)) value = getPath(b, f);
        map[f] = { basis: d.basis, value: value === undefined ? null : value, quote: typeof d.quote === "string" ? d.quote : "", reason: typeof d.reason === "string" ? d.reason : "", quote_check: qc };
      }
      run.judge[pair.key] = { model: S.run.models.judge, decisions: map, unresolved, unresolvedReason, at: new Date().toISOString() };
      log("judgeLog", "Judge settled " + Object.keys(map).length + " of " + r.disputed.length + " fields", "ok");
    } catch (e) {
      if (!isAbort(e)) { showErr("judgeErr", e.message); log("judgeLog", e.message, "err"); }
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove("spin"); }
    }
    renderAgreement();
    await rebuildBundle();
  }

  async function judgeAll() {
    if (S.judging) return;
    const jobs = [];
    for (const p of S.papers) {
      const run = S.runs[p.uid];
      if (!run || run.status !== "done") continue;
      for (const pair of run.agreement.pairs) {
        if (run.judge[pair.key]) continue;
        if (resolvePair(run, pair).disputed.length) jobs.push([p, pair]);
      }
    }
    if (!jobs.length) return;
    S.judging = true;
    const btn = $("judgeAllBtn");
    btn.disabled = true; btn.classList.add("spin");
    try { await pool(jobs, 2, ([p, pair]) => judgePair(p, pair, null)); }
    finally { S.judging = false; btn.classList.remove("spin"); renderAgreement(); }
  }

  /* ------------------------------------------------------------------ */
  /* Step 7: records and bundle                                         */
  /* ------------------------------------------------------------------ */

  function buildRecord(p, run) {
    const R = S.run;
    const ag = run.agreement;
    const accepted = [], flagged = [];
    for (const pair of ag.pairs) {
      const r = resolvePair(run, pair);
      const entry = {
        status: r.status,
        readers: { a_index: pair.ai, b_index: pair.bi },
        claim: r.claim,
        source_pointer: r.pointer,
        judged_fields: Object.keys(r.judged).length ? r.judged : undefined,
        disputed_fields: r.disputed.length ? r.disputed : undefined
      };
      if (r.status === "flagged") { entry.reason = r.reason; flagged.push(entry); } else accepted.push(entry);
    }
    for (const i of ag.onlyA) flagged.push({ status: "flagged", reason: "reported by reader A only", readers: { a_index: i, b_index: null } });
    for (const j of ag.onlyB) flagged.push({ status: "flagged", reason: "reported by reader B only", readers: { a_index: null, b_index: j } });
    const fieldStatus = (pair) => Object.fromEntries(pair.fields.map((f) => [f.path, run.judge[pair.key] && run.judge[pair.key].decisions[f.path] ? "judged:" + run.judge[pair.key].decisions[f.path].basis : f.status]));
    return {
      protocol: PROTOCOL,
      pin: R.pin,
      source: {
        doi: p.doi || null,
        pmcid: p.pmcid || null,
        openalex_id: p.openalex_id || null,
        title: p.title,
        year: p.year || null,
        url: p.url || null,
        text_kind: run.text_kind,
        text_chars: run.text.length,
        text_sha256: run.text_sha256,
        retrieved_from: p.sources
      },
      extraction_a: { model: run.a.model, temperature: run.a.temperature, claims: run.a.claims },
      extraction_b: { model: run.b.model, temperature: run.b.temperature, claims: run.b.claims },
      agreement: {
        rules: { strings: "normalized match or token overlap (containment >= 0.8, Dice >= 0.75, numbers inside text must match)", numbers: "relative tolerance 1%", quotes: "must occur in the source text after normalizing case, spacing and punctuation" },
        summary: runSummary(run),
        pairs: ag.pairs.map((pair) => ({
          a_index: pair.ai, b_index: pair.bi, similarity: pair.similarity,
          fields: fieldStatus(pair),
          quote_a: pair.quoteA.status, quote_b: pair.quoteB.status,
          judge: run.judge[pair.key] ? { model: run.judge[pair.key].model, unresolved: run.judge[pair.key].unresolved } : undefined
        })),
        only_a: ag.onlyA,
        only_b: ag.onlyB
      },
      accepted_fields: accepted,
      flagged,
      created_at: run.created_at,
      contributor: $("handle").value.trim() || null
    };
  }

  async function rebuildBundle() {
    const done = S.papers.filter((p) => S.runs[p.uid] && S.runs[p.uid].status === "done");
    if (!done.length || !S.run) { S.bundle = null; renderBundle(); return; }
    const records = done.map((p) => buildRecord(p, S.runs[p.uid]));
    const recordHashes = [];
    for (const r of records) recordHashes.push(await sha256hex(canon(r)));
    const bundle = {
      protocol: PROTOCOL,
      kind: "pramana.bundle",
      topic: S.run.topic,
      created_at: new Date().toISOString(),
      contributor: $("handle").value.trim() || null,
      generator: { name: "pramana-protocol-web", version: APP_VERSION, url: APP_URL, mode: S.demo ? "demo" : "live" },
      pin: S.run.pin,
      search: { queries: S.run.queries, sources: S.demo ? ["arXiv (demo)"] : ["OpenAlex", "Europe PMC"] },
      schema: S.run.schema,
      manifest: records.map((r, i) => ({ record_sha256: recordHashes[i], doi: r.source.doi, pmcid: r.source.pmcid, title: r.source.title, text_kind: r.source.text_kind, accepted: r.accepted_fields.length, flagged: r.flagged.length })),
      records
    };
    const text = JSON.stringify(bundle, null, 2) + "\n";
    const hash = await sha256hex(text);
    S.bundle = { text, hash, file: "pramana-bundle-" + hash.slice(0, 16) + ".json", bundle, bytes: new TextEncoder().encode(text).length };
    renderBundle();
  }
  const rebuildSoon = debounce(() => { rebuildBundle(); }, 300);

  function renderBundle() {
    const b = S.bundle;
    $("bundleOut").hidden = !b;
    if (!b) { updateGates(); return; }
    const kv = $("bundleKv");
    clear(kv);
    const acc = b.bundle.records.reduce((n, r) => n + r.accepted_fields.length, 0);
    const fl = b.bundle.records.reduce((n, r) => n + r.flagged.length, 0);
    const rows = [
      ["file", b.file, true],
      ["sha256", b.hash, true],
      ["size", fmtInt(b.bytes) + " bytes", false],
      ["records", b.bundle.records.length + " papers, " + acc + " accepted claims, " + fl + " held for review", false],
      ["pin", b.bundle.pin.pin_sha256, true]
    ];
    if (S.demo) rows.push(["mode", "demo bundle; marked as such in generator.mode", false]);
    for (const [k, v, mono] of rows) { kv.appendChild(h("dt", null, k)); kv.appendChild(h("dd", { class: mono ? "mono" : null }, v)); }
    $("recordPreview").textContent = JSON.stringify(b.bundle.records[0], null, 2);
    $("publishCmd").textContent =
      "logosctl daemon start --detach\n" +
      "logosctl call storage_module uploadUrl \"$PWD/" + b.file + "\" 65536 true\n" +
      "logosctl call storage_module manifests | jq -r '.result.value[0].cid'";
    updateGates();
  }

  function download() {
    const b = S.bundle;
    if (!b) return;
    const blob = new Blob([b.text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: b.file });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  const CID_RE = /^(z[1-9A-HJ-NP-Za-km-z]{40,120}|b[a-z2-7]{50,120}|Qm[1-9A-HJ-NP-Za-km-z]{44}|f[0-9a-f]{60,140})$/;

  function saveCid() {
    const cid = $("cidInput").value.trim();
    if (!S.bundle) { setStatus("cidStatus", "Build a bundle first.", "err"); return; }
    if (!CID_RE.test(cid)) { setStatus("cidStatus", "That does not look like a content ID. Logos Storage CIDs usually start with \"z\" and are about 50 characters long.", "err"); return; }
    const list = store.get(STORE_CONTRIB) || [];
    const entry = {
      cid, bundle_sha256: S.bundle.hash, file: S.bundle.file, topic: S.run.topic,
      papers: S.bundle.bundle.records.length, mode: S.demo ? "demo" : "live", saved_at: new Date().toISOString()
    };
    const next = [entry].concat(list.filter((x) => x.cid !== cid)).slice(0, 100);
    const ok = store.set(STORE_CONTRIB, next);
    S.memContrib = next;
    setStatus("cidStatus", ok ? "Saved to this device's contribution list." : "Saved for this session only; this browser blocks local storage.", "ok");
    const out = $("cidOut");
    clear(out);
    out.hidden = false;
    out.appendChild(h("div", null, "Bundle address: ", h("code", null, cid)));
    out.appendChild(h("div", { class: "hint" }, "Anyone with a Logos node can fetch it with: ", h("code", null, "logosctl call storage_module downloadToUrl \"" + cid + "\" \"$PWD/" + S.bundle.file + "\" false 65536 false false"), ". The file's SHA-256 should be " + S.bundle.hash.slice(0, 16) + "..."));
    renderContribs();
  }

  function renderContribs() {
    const list = S.memContrib || store.get(STORE_CONTRIB) || [];
    const ul = $("contribList");
    clear(ul);
    $("contribEmpty").textContent = list.length ? "Recorded on this device only." : "Bundles you publish and record here are listed on this device only. None yet.";
    for (const c of list) {
      ul.appendChild(h("li", null,
        h("div", null, h("code", null, c.cid),
          h("div", { class: "m" }, (c.topic || "untitled") + ", " + c.papers + " papers, " + (c.saved_at || "").slice(0, 10) + (c.mode === "demo" ? ", demo" : "") + ", sha256 " + (c.bundle_sha256 || "").slice(0, 12) + "...")),
        h("button", { class: "btn link", type: "button", onclick: () => {
          const next = (store.get(STORE_CONTRIB) || S.memContrib || []).filter((x) => x.cid !== c.cid);
          store.set(STORE_CONTRIB, next); S.memContrib = next; renderContribs();
        } }, "Remove")));
    }
  }

  async function copyFrom(id, btn) {
    const text = $(id).textContent;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; }
    catch (e) {
      try {
        const ta = h("textarea", { style: "position:fixed;left:-9999px;top:0" });
        ta.value = text; document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); ta.remove();
      } catch (e2) { ok = false; }
    }
    const old = btn.textContent;
    btn.textContent = ok ? "Copied" : "Select and copy";
    setTimeout(() => { btn.textContent = old; }, 1400);
  }

  /* ------------------------------------------------------------------ */
  /* Gates, rail, demo                                                  */
  /* ------------------------------------------------------------------ */

  function updateGates() {
    const hasDesign = !$("designOut").hidden;
    const schemaOk = hasDesign && !!S.schema;
    const sel = S.papers.filter((p) => p.selected).length;
    const anyDone = Object.values(S.runs).some((r) => r.status === "done");
    const c = cfg();
    const keyReady = S.demo || (c.provider === "compatible" ? /^https?:\/\//.test(c.baseUrl) : !!c.key);
    const lock = (id, v) => $(id).setAttribute("data-locked", v ? "true" : "false");
    lock("s3", !hasDesign);
    lock("s4", !schemaOk);
    lock("s5", !sel);
    lock("s6", !anyDone);
    lock("s7", !S.bundle);
    $("searchBtn").disabled = !schemaOk;
    $("extractBtn").disabled = !sel || !schemaOk || S.extracting;
    const states = {
      1: keyReady ? "done" : "active",
      2: hasDesign ? "done" : keyReady ? "active" : "todo",
      3: schemaOk ? "done" : hasDesign ? "active" : "todo",
      4: anyDone || sel ? "done" : schemaOk ? "active" : "todo",
      5: anyDone ? "done" : sel ? "active" : "todo",
      6: anyDone ? "done" : "todo",
      7: S.bundle ? "active" : "todo",
      8: "todo"
    };
    document.querySelectorAll("#railList li").forEach((li) => { li.dataset.state = states[li.dataset.step] || "todo"; });
  }

  function resetRun() {
    if (S.ctrl) S.ctrl.abort();
    S.schema = null; S.pin = null; S.papers = []; S.run = null; S.runs = {}; S.bundle = null;
    S.usage = { calls: 0, inTok: 0, outTok: 0, cost: 0, unpriced: 0 };
    $("designOut").hidden = true;
    $("queries").value = ""; $("schema").value = "";
    for (const id of ["designLog", "searchLog", "extractLog", "judgeLog", "progBody", "agreeList", "paperList"]) clear($(id));
    for (const id of ["designErr", "searchErr", "extractErr", "judgeErr"]) showErr(id, "");
    for (const id of ["topicStatus", "schemaStatus", "cidStatus"]) setStatus(id, "");
    $("progTable").hidden = true; $("agreeTop").hidden = true; $("cidOut").hidden = true; $("paperTools").hidden = true;
    $("extractBtn").textContent = "Run both readers"; $("extractBtn").dataset.retry = "";
    $("estimate").textContent = "";
    renderPin(); renderBundle(); renderLedger(); updateGates();
  }

  function setDemo(on) {
    S.demo = on;
    $("demoBanner").hidden = !on;
    $("modeBadge").textContent = on ? "Demo" : "Live";
    $("modeBadge").className = "mode" + (on ? " demo" : "");
    $("s1").style.opacity = on ? "0.55" : "";
    renderLedger();
  }

  let demoRunning = false;
  async function runDemo() {
    if (demoRunning) return;
    demoRunning = true;
    const btn = $("demoBtn");
    btn.disabled = true;
    try {
      resetRun();
      setDemo(true);
      $("topic").value = DEMO.topic;
      scrollToId("s2");
      await sleep(500);
      if (!(await runDesign())) return;
      await sleep(250);
      scrollToId("s3");
      await sleep(900);
      scrollToId("s4");
      if (!(await runSearch())) return;
      await sleep(700);
      scrollToId("s5");
      await runExtraction();
      await sleep(300);
      scrollToId("s6");
    } finally { demoRunning = false; btn.disabled = false; }
  }

  function exitDemo() {
    setDemo(false);
    resetRun();
    $("topic").value = "";
    scrollToId("s1");
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                             */
  /* ------------------------------------------------------------------ */

  function init() {
    loadKeys();
    document.querySelectorAll('input[name="provider"]').forEach((r) => r.addEventListener("change", () => { if (S.demo) { setDemo(false); resetRun(); } onProviderChange(false); }));
    for (const id of ["apiKey", "baseUrl", "mDesign", "mJudge", "mA", "mB", "tA", "tB"]) {
      $(id).addEventListener("input", () => {
        persistKeys(); updateGates(); renderEstimate();
        if (S.schema && !S.extracting) onSchemaInput();
        if (id === "apiKey" && S.demo && $("apiKey").value.trim()) { setDemo(false); resetRun(); }
      });
    }
    $("rememberKey").addEventListener("change", () => {
      if ($("rememberKey").checked) { persistKeys(); setStatus("keyStatus", "Saved on this device. Untick to forget it.", "ok"); }
      else { store.del(STORE_KEYS); setStatus("keyStatus", "Removed from this device. The key stays in this tab's memory until you close it.", ""); }
    });
    $("toggleKey").addEventListener("click", () => {
      const show = $("apiKey").type === "password";
      $("apiKey").type = show ? "text" : "password";
      $("toggleKey").textContent = show ? "Hide" : "Show";
      $("toggleKey").setAttribute("aria-pressed", String(show));
    });
    $("testKeyBtn").addEventListener("click", testKey);
    $("resetModelsBtn").addEventListener("click", () => { applyProviderDefaults(cfg().provider); persistKeys(); if (S.schema) onSchemaInput(); });

    document.querySelectorAll(".ex").forEach((b) => b.addEventListener("click", () => { $("topic").value = b.dataset.topic; $("topic").focus(); }));
    $("topic").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); designAndGo(); } });
    $("designBtn").addEventListener("click", designAndGo);
    $("coreOnlyBtn").addEventListener("click", coreOnly);

    $("schema").addEventListener("input", onSchemaInput);
    $("queries").addEventListener("input", updateGates);

    $("searchBtn").addEventListener("click", runSearch);
    $("addIdBtn").addEventListener("click", addById);
    $("addId").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addById(); } });
    $("selFirst5").addEventListener("click", () => { selectFirst(5); renderPapers(); updateGates(); });
    $("selNone").addEventListener("click", () => { S.papers.forEach((p) => (p.selected = false)); renderPapers(); updateGates(); });

    $("extractBtn").addEventListener("click", () => runExtraction({ retry: $("extractBtn").dataset.retry === "1" }));
    $("stopBtn").addEventListener("click", () => { if (S.ctrl) S.ctrl.abort(); log("extractLog", "Stopping after the current requests", "err"); });

    $("judgeAllBtn").addEventListener("click", judgeAll);

    $("handle").addEventListener("input", rebuildSoon);
    $("downloadBtn").addEventListener("click", download);
    $("saveCidBtn").addEventListener("click", saveCid);
    $("cidInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveCid(); } });
    document.querySelectorAll(".copy").forEach((b) => b.addEventListener("click", () => copyFrom(b.dataset.copy, b)));

    $("demoBtn").addEventListener("click", runDemo);
    $("exitDemoBtn").addEventListener("click", exitDemo);

    renderPin();
    renderContribs();
    renderLedger();
    updateGates();
  }

  async function designAndGo() {
    if (await runDesign()) scrollToId("s3");
  }

  // Exposed for tests and for anyone who wants to reuse the comparison rules.
  window.Pramana = { canon, sha256hex, sha256Fallback, compareValues, checkQuote, invertAbstract, jatsToText, parseJSONLoose, compareRun, state: S, PROMPTS, CORE_FIELDS };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
