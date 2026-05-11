'use strict';

const { streamText } = require('ai');
const { getModel } = require('./models');
const { getJob, updateJob } = require('./db');
const { parseStations } = require('./config-writer');
const { jobEmitter } = require('./emitter');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// API key validation -- fail loud, not silent
// ---------------------------------------------------------------------------

function validateApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.trim() === '') {
    throw new Error(
      'ANTHROPIC_API_KEY is empty or missing. Set it in web/.env. ' +
      'This is an infrastructure error -- cannot fall back.'
    );
  }
  if (!key.startsWith('sk-ant-')) {
    throw new Error(
      `ANTHROPIC_API_KEY looks malformed (starts with "${key.slice(0, 8)}..."). ` +
      'Expected "sk-ant-..." format. Check web/.env for duplicate keys.'
    );
  }
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildPlannerSystemPrompt() {
  return `You are a UX walkthrough planning specialist. You design evaluation station sequences for usability walkthroughs of websites.

You will receive a target URL, user persona descriptions, and research objectives. You must output a complete walkthrough task card in a specific markdown format.

## Output Format Rules (CRITICAL -- follow exactly)

The output must be a valid markdown document with:

1. A title line: # Walkthrough Task Card -- {site name}
2. Metadata: station count, goal summary
3. An overview table (Station | ID | Category | Primary Persona | Auxiliary Persona)
4. Station sections, each starting with exactly this header format:
   ## 站点 N: Chinese Name (English Name)
   where N is a sequential integer starting from 1.

### Per-Station Structure

Each station section must contain:

\`\`\`
## 站点 N: Name (English Name)

**Goal**: One-sentence evaluation goal

### Steps

1. **Action description**
   - Detail or observation point
   - Screenshot: \`r1_sN_category_stepNN_action.png\`

2. **Next action**
   ...

### Multi-Persona Evaluation

**Persona Name -- Evaluation Points**:
- [ ] Specific evaluation question from this persona's perspective
- [ ] Another question
...
\`\`\`

## Station Design Principles

1. Follow a natural user journey: Landing -> Exploration -> Detail -> Action/Conversion
2. Station 1 should always be homepage/landing page evaluation
3. Middle stations cover search, browsing, content evaluation, and comparison
4. Final stations cover the primary conversion flow (signup, purchase, inquiry, etc.)
5. Generate 5-9 stations based on scope complexity
6. Each station should have 5-10 operation steps with specific browser actions
7. Operation steps must be concrete: navigate to URL, type search term, click element, scroll, take screenshot
8. Include specific search terms or actions relevant to the user's stated goal
9. Assign primary and auxiliary personas per station based on relevance to that stage

## Evaluation Dimensions Guidelines

For each persona assigned to a station, include 3-6 evaluation checklist items as:
- [ ] Specific question from this persona's perspective

Focus on: information hierarchy, navigation clarity, trust signals, cognitive load, task efficiency, error recovery.

## Screenshot Naming Convention

Use: r1_sN_category_stepNN_action.png
Example: r1_s1_homepage_step01_navigate.png, r1_s3_product_step04_scroll_specs.png

## Language

- Station headers: Chinese + English in parentheses
- Operation steps: Chinese
- Evaluation items: Chinese
- Match the bilingual convention consistently

## Important

- Output ONLY the task card markdown. No extra prose before or after.
- Every station header MUST match this regex: /^## 站点\\s*\\d+:\\s*.+$/
- Station numbers must be sequential starting from 1`;
}

function buildPlannerUserPrompt(context, personasDoc) {
  const {
    url,
    personas,
    user_goal,
    business_question,
    research_question,
    in_scope,
    custom_persona,
    rules,
  } = context;

  const personaNames = Array.isArray(personas) ? personas.join(', ') : personas;

  let prompt = `Please design a station plan for the following walkthrough:

## Target Website
${url}

## Selected Personas
${personaNames}

### Persona Details
${personasDoc}
`;

  if (user_goal) {
    prompt += `\n## User Task Goal\n${user_goal}\n`;
  }

  if (business_question) {
    prompt += `\n## Business Question\n${business_question}\n`;
  }

  if (research_question) {
    prompt += `\n## Research Question\n${research_question}\n`;
  }

  if (in_scope) {
    prompt += `\n## Walkthrough Scope\n${in_scope}\n`;
  }

  if (custom_persona) {
    prompt += `\n## Custom Persona\n${custom_persona}\n`;
  }

  if (rules) {
    prompt += `\n## Evaluation Rules\n${rules}\n`;
  }

  prompt += `\nGenerate a complete task card with 5-9 stations. Cover the user's full journey from initial landing to completing their core task. Each station must include detailed operation steps and multi-persona evaluation dimensions.`;

  return prompt;
}

// ---------------------------------------------------------------------------
// Plan generation
// ---------------------------------------------------------------------------

async function generatePlan(projectRoot, jobId, context) {
  try {
    // Validate API key before attempting LLM call -- throw on infra error
    validateApiKey();

    const job = await getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const instanceDir = path.join(projectRoot, 'instances', jobId);

    // Read personas doc for prompt context
    const personasDoc = fs.readFileSync(
      path.join(instanceDir, 'personas.md'),
      'utf8'
    );

    const systemPrompt = buildPlannerSystemPrompt();
    const userPrompt = buildPlannerUserPrompt(context, personasDoc);

    console.log(`[planner] Generating plan for job ${jobId}...`);

    const PLAN_TIMEOUT_MS = 120_000;

    // Use streaming to emit progress as stations are detected
    const result = streamText({
      model: getModel('claude-sonnet'),
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 8192,
    });

    let text = '';
    let lastStationCount = 0;
    let lastParseTime = 0;
    const startTime = Date.now();

    for await (const chunk of result.textStream) {
      if (Date.now() - startTime > PLAN_TIMEOUT_MS) {
        throw new Error(`Plan generation timeout (${PLAN_TIMEOUT_MS / 1000}s)`);
      }
      text += chunk;

      // Throttle station parsing to at most once per 300ms
      const now = Date.now();
      if (now - lastParseTime < 300) continue;
      lastParseTime = now;

      const currentStations = parseStations(text);
      if (currentStations.length > lastStationCount) {
        lastStationCount = currentStations.length;
        jobEmitter.emit(`job:${jobId}`, {
          type: 'plan-progress',
          stationsFound: currentStations.length,
          latestStation: currentStations[currentStations.length - 1]?.name || '',
        });
      }
    }

    // Validate output
    const stations = parseStations(text);
    if (stations.length < 3) {
      throw new Error(
        `Only ${stations.length} stations parsed from LLM output, minimum is 3`
      );
    }

    // Write task_card.md to instance directory
    fs.writeFileSync(path.join(instanceDir, 'task_card.md'), text, 'utf8');

    // Update job in DB -- mark as dynamically generated
    const existingPlan = job.plan || {};
    await updateJob(jobId, {
      status: 'planning',
      plan: {
        ...existingPlan,
        stations,
        generating: false,
        generated: true,
        plan_source: 'dynamic',
        fallback: false,
      },
    });

    console.log(
      `[planner] Plan generated for job ${jobId}: ${stations.length} stations`
    );

    jobEmitter.emit(`job:${jobId}`, { type: 'plan-ready', stations });
  } catch (err) {
    console.error(
      `[planner] Plan generation failed for ${jobId}:`,
      err.message
    );

    // Infrastructure errors (bad API key) should NOT fallback -- propagate
    if (err.message.includes('ANTHROPIC_API_KEY')) {
      await updateJob(jobId, {
        status: 'failed',
        error_msg: err.message,
        completed_at: new Date().toISOString(),
        plan: {
          ...(await getJob(jobId))?.plan,
          generating: false,
          generated: false,
          plan_source: 'none',
          fallback_reason: err.message,
        },
      });
      jobEmitter.emit(`job:${jobId}`, { type: 'failed', error: err.message });
      return; // Do NOT fallback
    }

    // Real LLM failures -> visible fallback
    await fallbackToTemplate(projectRoot, jobId, err.message);
  }
}

async function fallbackToTemplate(projectRoot, jobId, reason) {
  console.warn(`\n⚠️  [planner] FALLBACK for job ${jobId}`);
  console.warn(`⚠️  Reason: ${reason}`);
  console.warn(`⚠️  Using default template. Plan quality may be degraded.\n`);

  // Use a generic fallback template instead of alibaba-specific one
  const fallbackPath = path.join(projectRoot, 'templates', 'fallback_task_card.md');
  let template;

  if (fs.existsSync(fallbackPath)) {
    template = fs.readFileSync(fallbackPath, 'utf8');
  } else {
    // If no fallback template exists, generate a minimal one
    template = generateMinimalFallbackTaskCard(projectRoot, jobId);
  }

  const instanceDir = path.join(projectRoot, 'instances', jobId);
  fs.writeFileSync(path.join(instanceDir, 'task_card.md'), template, 'utf8');

  const stations = parseStations(template);
  const job = await getJob(jobId);
  await updateJob(jobId, {
    status: 'planning',
    plan: {
      ...(job?.plan || {}),
      stations,
      generating: false,
      generated: false,
      plan_source: 'fallback',
      fallback: true,
      fallback_reason: reason,
    },
  });

  console.warn(
    `⚠️  [planner] Fell back to template for job ${jobId}: ${stations.length} stations`
  );

  jobEmitter.emit(`job:${jobId}`, {
    type: 'plan-ready',
    stations,
    fallback: true,
    fallback_reason: reason,
  });
}

// Generate a minimal generic task card when no template file exists
function generateMinimalFallbackTaskCard(projectRoot, jobId) {
  // Try to read the job's config to get the URL
  let url = 'the target website';
  try {
    const configPath = path.join(projectRoot, 'instances', jobId, 'config.md');
    const config = fs.readFileSync(configPath, 'utf8');
    const urlMatch = config.match(/- URL:\s*(.+)/);
    if (urlMatch) url = urlMatch[1].trim();
  } catch (_) {}

  return `# Walkthrough Task Card -- Generic Evaluation

> Note: This is a fallback template. Dynamic plan generation failed. Results may not be optimally tailored to the target site.

## Overview

| Station | ID | Category | Primary Persona | Auxiliary Persona |
|---------|-----|----------|----------------|-------------------|
| Landing Page | S1 | Homepage | New User | Experienced User |
| Navigation & Search | S2 | Discovery | New User | Experienced User |
| Content / Listing Page | S3 | Browsing | Experienced User | New User |
| Detail Page | S4 | Evaluation | New User | Experienced User |
| Conversion Flow | S5 | Action | New User | Experienced User |

## 站点 1: Landing Page (Homepage Evaluation)

**Goal**: Evaluate first impression, value proposition clarity, and navigation discoverability

### Steps

1. **Navigate to ${url}**
   - Observe initial load time and above-the-fold content
   - Screenshot: \`r1_s1_homepage_step01_navigate.png\`

2. **Scroll down to review the full homepage**
   - Check content hierarchy and information density
   - Screenshot: \`r1_s1_homepage_step02_scroll.png\`

3. **Identify primary navigation elements**
   - Check menu structure, categories, search bar visibility
   - Screenshot: \`r1_s1_homepage_step03_navigation.png\`

### Multi-Persona Evaluation

**New User Evaluation Points**:
- [ ] Is the value proposition clear within 5 seconds?
- [ ] Can I understand what this site offers without prior knowledge?
- [ ] Is the primary action (CTA) obvious and compelling?
- [ ] Are there any unfamiliar terms or jargon?

**Experienced User Evaluation Points**:
- [ ] Can I quickly find what I need (shortcuts, recent items)?
- [ ] Is the navigation efficient for repeat tasks?
- [ ] Are advanced features discoverable?

## 站点 2: Navigation & Search (Discovery)

**Goal**: Evaluate search functionality, navigation flow, and content discoverability

### Steps

1. **Use the search function**
   - Type a general search term related to the site's domain
   - Screenshot: \`r1_s2_search_step01_search.png\`

2. **Review search results**
   - Check relevance, layout, and filtering options
   - Screenshot: \`r1_s2_search_step02_results.png\`

3. **Try navigation categories**
   - Browse through category menus or navigation links
   - Screenshot: \`r1_s2_search_step03_categories.png\`

### Multi-Persona Evaluation

**New User Evaluation Points**:
- [ ] Is the search bar easy to find?
- [ ] Do search results make sense for a general query?
- [ ] Are filters intuitive to use?

**Experienced User Evaluation Points**:
- [ ] Does search support advanced queries?
- [ ] Can I quickly narrow results to what I need?

## 站点 3: Content / Listing Page (Browsing)

**Goal**: Evaluate listing page layout, content quality, and comparison capabilities

### Steps

1. **Browse a listing or category page**
   - Observe card layout, information density
   - Screenshot: \`r1_s3_listing_step01_browse.png\`

2. **Apply filters or sort options**
   - Test filtering and sorting functionality
   - Screenshot: \`r1_s3_listing_step02_filter.png\`

3. **Compare items visually**
   - Check if comparison is supported or easy
   - Screenshot: \`r1_s3_listing_step03_compare.png\`

### Multi-Persona Evaluation

**New User Evaluation Points**:
- [ ] Is the information on each card sufficient to make a decision?
- [ ] Are there trust signals (ratings, reviews, badges)?

**Experienced User Evaluation Points**:
- [ ] Can I efficiently scan and compare options?
- [ ] Are the most important details prominently displayed?

## 站点 4: Detail Page (Evaluation)

**Goal**: Evaluate detail page information architecture, trust signals, and decision support

### Steps

1. **Click into a detail page**
   - Review primary content and layout
   - Screenshot: \`r1_s4_detail_step01_view.png\`

2. **Scroll through all detail sections**
   - Check information completeness and hierarchy
   - Screenshot: \`r1_s4_detail_step02_scroll.png\`

3. **Look for trust and decision-support elements**
   - Reviews, specs, pricing, guarantees
   - Screenshot: \`r1_s4_detail_step03_trust.png\`

### Multi-Persona Evaluation

**New User Evaluation Points**:
- [ ] Is all the information I need to make a decision present?
- [ ] Are there confusing terms or unclear descriptions?
- [ ] Do I trust this enough to take the next action?

**Experienced User Evaluation Points**:
- [ ] Are specs and details complete and accurate?
- [ ] Can I quickly find the specific info I need?

## 站点 5: Conversion Flow (Primary Action)

**Goal**: Evaluate the primary conversion flow (purchase, signup, inquiry, etc.)

### Steps

1. **Initiate the primary action**
   - Click the main CTA (buy, sign up, contact, etc.)
   - Screenshot: \`r1_s5_convert_step01_initiate.png\`

2. **Complete the flow or review the form**
   - Check form fields, validation, guidance
   - Screenshot: \`r1_s5_convert_step02_form.png\`

3. **Review confirmation or next steps**
   - Check what happens after submission
   - Screenshot: \`r1_s5_convert_step03_confirm.png\`

### Multi-Persona Evaluation

**New User Evaluation Points**:
- [ ] Is the process straightforward with clear progress?
- [ ] Are required fields reasonable and well-explained?
- [ ] Do I know what to expect after completing the action?

**Experienced User Evaluation Points**:
- [ ] Is the process efficient without unnecessary steps?
- [ ] Can I use saved information or shortcuts?
`;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { generatePlan };
