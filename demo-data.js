/* Pre-recorded inputs for demo mode.
   Source excerpts are verbatim passages from the arXiv versions of the two papers
   (2304.03271v5 and 2508.15734v1). Reader outputs and the judge decision are canned
   so the loop can run without a key; the comparison, hashing and bundling code that
   processes them is the same code used for live runs. */
window.PRAMANA_DEMO = (function () {
  const topic = "AI data center water use";

  const design = {
    queries: [
      "water footprint of AI inference per prompt",
      "data center water consumption large language models",
      "AI data center water usage effectiveness"
    ],
    topic_fields: {
      water_kind: "enum[consumption, withdrawal, not stated]: consumption (evaporated, not returned) or withdrawal (taken from a source)",
      water_scope: "enum[on-site (scope 1), off-site electricity (scope 2), on-site + off-site, embodied (scope 3), not stated]: which water the number counts",
      functional_unit: "string: what the quantity is normalized to, such as per prompt, per response, per training run",
      workload: "enum[training, inference, both, not stated]",
      system: "string: the model or service measured",
      spatiotemporal_context: "string: where and when the number applies",
      method: "enum[direct measurement, model-based estimate, projection, not stated]"
    },
    note: "Water figures differ mainly in whether they count off-site water used to generate electricity and in what they are normalized to (per prompt, per response, per training run)."
  };

  const renText = [
    "Making AI Less \"Thirsty\": Uncovering and Addressing the Secret Water Footprint of AI Models",
    "",
    "## Abstract",
    "The growing carbon footprint of artificial intelligence (AI) has been undergoing public scrutiny. Nonetheless, the equally important water (withdrawal and consumption) footprint of AI has largely remained under the radar. For example, training the GPT-3 language model in Microsoft's state-of-the-art U.S. data centers can directly evaporate 700,000 liters of clean freshwater, but such information has been kept a secret. More critically, the global AI demand is projected to account for 4.2-6.6 billion cubic meters of water withdrawal in 2027, which is more than the total annual water withdrawal of 4-6 Denmark or half of the United Kingdom. This is concerning, as freshwater scarcity has become one of the most pressing challenges. To respond to the global water challenges, AI can, and also must, take social responsibility and lead by example by addressing its own water footprint. In this paper, we provide a principled methodology to estimate the water footprint of AI, and also discuss the unique spatial-temporal diversities of AI's runtime water efficiency. Finally, we highlight the necessity of holistically addressing water footprint along with carbon footprint to enable truly sustainable AI.",
    "",
    "## 1 Introduction (excerpt)",
    "By taking the GPT-3 model with 175 billion parameters as an example [11], we show that training GPT-3 in Microsoft’s U.S. data centers can consume a total of 5.4 million liters of water, including 700,000 liters of scope-1 on-site water consumption. Additionally, GPT-3 needs to “drink” (i.e., consume) a 500ml bottle of water for roughly 10 – 50 medium-length responses, depending on when and where it is deployed.",
    "",
    "## 2.2 (excerpt)",
    "AI’s water usage spans three scopes: on-site water for data center cooling (scope 1), off-site water for electricity generation (scope 2), and supply-chain water for server manufacturing (scope 3).",
    "",
    "## 3.1 Operational Water Footprint (excerpt)",
    "We collectively refer to on-site scope-1 water and off-site scope-2 water as the operational water.",
    "",
    "## 3.3 Case Study: Estimating GPT-3’s Operational Water Consumption Footprint (excerpt)",
    "The core of ChatGPT, a popular online service, is a large language model (LLM) based on subsequent versions of GPT-3. We present a case study to estimate the operational water consumption for the full GPT-3 model with 175 billion parameters [11]. We exclude embodied water footprint due to the lack of public data for scope-3 water usage. We choose GPT-3 as Microsoft publishes its location-wise WUE and PUE [27, 28]. The results are summarized in Table 1.",
    "",
    "## Table 1 (caption)",
    "Table 1: Estimate of GPT-3’s operational water consumption footprint. “*” denotes data centers under construction as of July 2023, whose PUE and WUE are projected by Microsoft."
  ].join("\n");

  const googText = [
    "Measuring the environmental impact of delivering AI at Google Scale",
    "",
    "## Abstract",
    "The transformative power of AI is undeniable - but as user adoption accelerates, so does the need to understand and mitigate the environmental impact of AI serving. However, no studies have measured AI serving environmental metrics in a production environment. This paper addresses this gap by proposing and executing a comprehensive methodology for measuring the energy usage, carbon emissions, and water consumption of AI inference workloads in a large-scale, AI production environment. Our approach accounts for the full stack of AI serving infrastructure - including active AI accelerator power, host system energy, idle machine capacity, and data center energy overhead. Through detailed instrumentation of Google's AI infrastructure for serving the Gemini AI assistant, we find the median Gemini Apps text prompt consumes 0.24 Wh of energy - a figure substantially lower than many public estimates. We also show that Google's software efficiency efforts and clean energy procurement have driven a 33x reduction in energy consumption and a 44x reduction in carbon footprint for the median Gemini Apps text prompt over one year. We identify that the median Gemini Apps text prompt uses less energy than watching nine seconds of television (0.24 Wh) and consumes the equivalent of five drops of water (0.26 mL). While these impacts are low compared to other daily activities, reducing the environmental impact of AI serving continues to warrant important attention. Towards this objective, we propose that a comprehensive measurement of AI serving environmental metrics is critical for accurately comparing models, and to properly incentivize efficiency gains across the full AI serving stack.",
    "",
    "## 4.1 Gemini Energy Consumption (excerpt)",
    "Applying our comprehensive measurement methodology, we find that the median energy consumption for a Gemini Apps text prompt in May 2025 is 0.24 Wh. As Table 1 and Figure 3 show, the primary energy draw originates from the active AI Accelerator power (0.14 Wh, 58% of total) and the necessary host CPU & DRAM power (0.06 Wh, 25%). The energy consumed by provisioned idle machines and the data center overhead (PUE) each contribute 0.02 Wh (10% and 8% respectively).",
    "",
    "## 4.2 Gemini Emissions & Water Consumption (excerpt)",
    "As Table 2 shows, a median Gemini Apps text prompt generates 0.03 gCO2e and consumes 0.26 mL of water when measured comprehensively. These values are even lower when considering a methodology more similar to a narrow, existing approach (0.01 gCO2e and 0.15 mL of water consumption). To put this into context: a modern television consumes approximately 100 watts of electricity [36], so 0.24 Wh represents less energy than watching TV for 9 seconds. The water use of 0.26 mL equals five drops of water (based on a standard 0.05 mL drop), orders of magnitude less than previous estimates of 45 [18] to 50 mL [16]."
  ].join("\n");

  const papers = [
    {
      uid: "demo-ren",
      title: "Making AI Less \"Thirsty\": Uncovering and Addressing the Secret Water Footprint of AI Models",
      year: 2023,
      authors: "Pengfei Li, Jianyi Yang, Mohammad A. Islam, Shaolei Ren",
      venue: "arXiv 2304.03271 (v5); accepted by Communications of the ACM",
      doi: "10.48550/arXiv.2304.03271",
      url: "https://arxiv.org/abs/2304.03271",
      pmcid: null,
      openalex_id: null,
      sources: ["arXiv"],
      abstract: "",
      fulltext: "excerpt",
      demoText: renText
    },
    {
      uid: "demo-google",
      title: "Measuring the environmental impact of delivering AI at Google Scale",
      year: 2025,
      authors: "Cooper Elsworth, Keguo Huang, David Patterson, et al.",
      venue: "arXiv 2508.15734 (v1)",
      doi: "10.48550/arXiv.2508.15734",
      url: "https://arxiv.org/abs/2508.15734",
      pmcid: null,
      openalex_id: null,
      sources: ["arXiv"],
      abstract: "",
      fulltext: "excerpt",
      demoText: googText
    }
  ];

  const renInference = {
    subject: "GPT-3 (175 billion parameters) serving responses",
    outcome: "operational water consumption",
    measure: "medium-length responses per 500 mL of water",
    relation: "quantifies",
    direction: "not_applicable",
    effect: { value: null, lower: 10, upper: 50, unit: "responses per 500 mL", interval_type: "range across deployment locations and times" },
    population: "GPT-3 in Microsoft data center locations listed in Table 1",
    design: "model-based estimate",
    conditions: "depends on when and where the model is deployed",
    certainty: "estimated: roughly",
    origin: "own_result",
    topic: {
      water_kind: "consumption",
      water_scope: "on-site + off-site",
      functional_unit: "per medium-length response",
      workload: "inference",
      system: "GPT-3",
      spatiotemporal_context: "Microsoft U.S. data center locations; varies by location and time",
      method: "model-based estimate"
    },
    source_pointer: {
      section: "1 Introduction",
      quote: "GPT-3 needs to “drink” (i.e., consume) a 500ml bottle of water for roughly 10 – 50 medium-length responses, depending on when and where it is deployed."
    }
  };

  const renTraining = {
    subject: "GPT-3 training",
    outcome: "total water consumption",
    measure: "liters of water",
    relation: "quantifies",
    direction: "not_applicable",
    effect: { value: 5400000, lower: null, upper: null, unit: "liters", interval_type: null },
    population: "Microsoft U.S. data centers",
    design: "model-based estimate",
    conditions: "includes 700,000 liters of scope-1 on-site water consumption",
    certainty: "estimated: can consume",
    origin: "own_result",
    topic: {
      water_kind: "consumption",
      water_scope: "on-site + off-site",
      functional_unit: "per training run",
      workload: "training",
      system: "GPT-3",
      spatiotemporal_context: "Microsoft U.S. data centers",
      method: "model-based estimate"
    },
    source_pointer: {
      section: "1 Introduction",
      quote: "training GPT-3 in Microsoft’s U.S. data centers can consume a total of 5.4 million liters of water, including 700,000 liters of scope-1 on-site water consumption."
    }
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  const renB1 = clone(renInference);
  renB1.subject = "GPT-3 inference";
  renB1.effect.unit = "medium-length responses per 500 mL bottle";
  renB1.topic.water_scope = "on-site (scope 1)";
  renB1.population = "GPT-3 in Microsoft data center locations (Table 1)";

  const renB2 = clone(renTraining);
  const renB3 = {
    subject: "GPT-3 training",
    outcome: "on-site water consumption",
    measure: "liters of water",
    relation: "quantifies",
    direction: "not_applicable",
    effect: { value: 700000, lower: null, upper: null, unit: "liters", interval_type: null },
    population: "Microsoft U.S. data centers",
    design: "model-based estimate",
    conditions: "scope-1 on-site water only",
    certainty: "estimated: can consume",
    origin: "own_result",
    topic: {
      water_kind: "consumption",
      water_scope: "on-site (scope 1)",
      functional_unit: "per training run",
      workload: "training",
      system: "GPT-3",
      spatiotemporal_context: "Microsoft U.S. data centers",
      method: "model-based estimate"
    },
    source_pointer: {
      section: "1 Introduction",
      quote: "including 700,000 liters of scope-1 on-site water consumption"
    }
  };

  const gEnergy = {
    subject: "Gemini Apps text prompt (median)",
    outcome: "energy consumption",
    measure: "Wh per median text prompt",
    relation: "quantifies",
    direction: "not_applicable",
    effect: { value: 0.24, lower: null, upper: null, unit: "Wh", interval_type: null },
    population: "Gemini Apps production serving at Google",
    design: "direct measurement of production infrastructure",
    conditions: "May 2025; comprehensive full-stack measurement boundary",
    certainty: "measured",
    origin: "own_result",
    topic: {
      water_kind: null,
      water_scope: null,
      functional_unit: "per median text prompt",
      workload: "inference",
      system: "Gemini Apps",
      spatiotemporal_context: "Google production fleet, May 2025",
      method: "direct measurement"
    },
    source_pointer: {
      section: "4.1 Gemini Energy Consumption",
      quote: "we find that the median energy consumption for a Gemini Apps text prompt in May 2025 is 0.24 Wh."
    }
  };

  const gWater = {
    subject: "Gemini Apps text prompt (median)",
    outcome: "water consumption",
    measure: "mL of water per median text prompt",
    relation: "quantifies",
    direction: "not_applicable",
    effect: { value: 0.26, lower: null, upper: null, unit: "mL", interval_type: null },
    population: "Gemini Apps production serving at Google",
    design: "direct measurement of production infrastructure",
    conditions: "comprehensive methodology",
    certainty: "measured",
    origin: "own_result",
    topic: {
      water_kind: "consumption",
      water_scope: "not stated",
      functional_unit: "per median text prompt",
      workload: "inference",
      system: "Gemini Apps",
      spatiotemporal_context: "Google production fleet, May 2025",
      method: "direct measurement"
    },
    source_pointer: {
      section: "4.2 Gemini Emissions & Water Consumption",
      quote: "a median Gemini Apps text prompt generates 0.03 gCO2e and consumes 0.26 mL of water when measured comprehensively."
    }
  };

  const gNarrow = {
    subject: "Gemini Apps text prompt (median)",
    outcome: "water consumption under a narrower existing methodology",
    measure: "mL of water per median text prompt",
    relation: "quantifies",
    direction: "not_applicable",
    effect: { value: 0.15, lower: null, upper: null, unit: "mL", interval_type: null },
    population: "Gemini Apps production serving at Google",
    design: "direct measurement of production infrastructure",
    conditions: "narrow, existing measurement approach",
    certainty: "measured",
    origin: "own_result",
    topic: {
      water_kind: "consumption",
      water_scope: "not stated",
      functional_unit: "per median text prompt",
      workload: "inference",
      system: "Gemini Apps",
      spatiotemporal_context: "Google production fleet",
      method: "direct measurement"
    },
    source_pointer: {
      section: "4.2 Gemini Emissions & Water Consumption",
      quote: "These values are even lower when considering a methodology more similar to a narrow, existing approach (0.01 gCO2e and 0.15 mL of water consumption)."
    }
  };

  const gEnergyB = clone(gEnergy);
  gEnergyB.design = "direct measurement";
  // Reader B paraphrased this quote; the quote check should catch it.
  gEnergyB.source_pointer = { section: "4.1", quote: "the median Gemini text prompt uses 0.24 Wh in May 2025" };
  const gWaterB = clone(gWater);
  gWaterB.conditions = "measured comprehensively";
  gWaterB.source_pointer = { section: "Abstract", quote: "consumes the equivalent of five drops of water (0.26 mL)" };
  const gNarrowB = clone(gNarrow);

  const extractions = {
    "demo-ren": { a: { claims: [renInference, renTraining] }, b: { claims: [renB1, renB2, renB3] } },
    "demo-google": { a: { claims: [gEnergy, gWater, gNarrow] }, b: { claims: [gEnergyB, gWaterB, gNarrowB] } }
  };

  // Canned judge decisions keyed by paper uid and disputed field path.
  const judge = {
    "demo-ren": {
      "topic.water_scope": {
        value: "on-site + off-site",
        basis: "A",
        quote: "We collectively refer to on-site scope-1 water and off-site scope-2 water as the operational water.",
        reason: "The per-response figure comes from the Table 1 estimate of operational water consumption, which the paper defines as on-site scope-1 plus off-site scope-2 water."
      },
      "subject": {
        value: "GPT-3 (175 billion parameters) serving responses",
        basis: "both",
        quote: "Additionally, GPT-3 needs to “drink” (i.e., consume) a 500ml bottle of water for roughly 10 – 50 medium-length responses",
        reason: "Both readings describe GPT-3 generating responses; the wording differs, the referent does not."
      }
    },
    "demo-google": {
      "conditions": {
        value: "comprehensive methodology",
        basis: "both",
        quote: "a median Gemini Apps text prompt generates 0.03 gCO2e and consumes 0.26 mL of water when measured comprehensively.",
        reason: "Both readings name the same comprehensive measurement boundary in different words."
      }
    }
  };

  return { topic, design, papers, extractions, judge };
})();
