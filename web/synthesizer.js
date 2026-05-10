'use strict';

const { generateText } = require('ai');
const { getModel } = require('./models');
const { supabaseAdmin } = require('./supabase');
const { getJob, updateJob } = require('./db');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract JSON from LLM response text.
 * Handles both ```json ... ``` fenced blocks and raw JSON.
 */
function extractJson(text) {
  // Try fenced block first
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1].trim());

  // Try raw JSON object
  const raw = text.match(/(\{[\s\S]*\})/);
  if (raw) return JSON.parse(raw[1].trim());

  throw new Error('No JSON found in LLM response');
}

// ---------------------------------------------------------------------------
// calibrateSeverity — pure function
// ---------------------------------------------------------------------------

/**
 * Upgrades severity when all personas are affected. Never downgrades.
 * @param {string} severity  - 'P0' | 'P1' | 'P2' | 'P3'
 * @param {number} affectedCount
 * @param {number} totalPersonas
 * @returns {string} calibrated severity
 */
function calibrateSeverity(severity, affectedCount, totalPersonas) {
  if (affectedCount >= totalPersonas && severity !== 'P0') {
    const ladder = ['P3', 'P2', 'P1', 'P0'];
    const idx = ladder.indexOf(severity);
    if (idx > 0) return ladder[idx - 1]; // upgrade one level
  }
  return severity;
}

// ---------------------------------------------------------------------------
// validateSynthesis
// ---------------------------------------------------------------------------

/**
 * Validates that the merge output is internally consistent.
 * @param {object[]} mergedFindings
 * @param {object[]} rawFindings
 * @returns {string[]} warnings
 */
function validateSynthesis(mergedFindings, rawFindings) {
  const warnings = [];
  const rawIds = new Set(rawFindings.map(f => f.id));
  const coveredRawIds = new Set();

  for (const mf of mergedFindings) {
    for (const origId of mf.original_finding_ids) {
      if (!rawIds.has(origId)) {
        warnings.push(
          `Merged finding ${mf.id} references unknown raw finding ID: ${origId}`
        );
      } else {
        coveredRawIds.add(origId);
      }
    }
  }

  // Every raw finding must be covered by at least one merged finding
  for (const rawId of rawIds) {
    if (!coveredRawIds.has(rawId)) {
      warnings.push(`Raw finding ${rawId} is not covered by any merged finding`);
    }
  }

  // Check for phantom P0: calibrated P0 where no raw P0 existed
  const rawHasP0 = rawFindings.some(f => f.severity === 'P0');
  if (!rawHasP0) {
    for (const mf of mergedFindings) {
      if (mf.severity === 'P0' && mf.original_severity !== 'P0') {
        warnings.push(
          `Merged finding ${mf.id} was calibrated to P0 but no raw finding had P0 severity`
        );
      }
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// deduplicateFindings
// ---------------------------------------------------------------------------

/**
 * Uses an LLM to semantically group duplicate findings across personas.
 * @param {object[]} findings - raw findings rows
 * @param {object} job
 * @returns {Promise<object[]>} merged finding objects (pre-DB, no job_id yet)
 */
async function deduplicateFindings(findings, job) {
  // Build indexed list for the prompt
  const indexedList = findings
    .map((f, i) => {
      const title = f.raw_data?.title || f.description?.slice(0, 60) || '(no title)';
      const excerpt = (f.description || '').slice(0, 120);
      return `[${i}] ${f.id} (${f.persona}, ${f.station}, ${f.severity}): ${title} — "${excerpt}"`;
    })
    .join('\n');

  const prompt = `You are a UX research analyst. Below is a numbered list of raw usability findings from multiple personas who independently walked through the same website.

Your task: identify which findings describe the SAME usability problem (duplicates) and group them together. Then produce a single merged finding for each group.

Merge rules (follow strictly):
1. Same station + same UI element → MERGE
2. Same station + different UI elements (e.g. price display vs. shipping info) → DO NOT merge
3. Different station + same type of problem → DO NOT merge
4. When uncertain → DO NOT merge (false negatives are cheaper than false positives)
5. Every input finding must appear in exactly one output group
6. Each group must have a merge_reason (one sentence explaining why they were grouped)

Severity selection for merged group: use the highest (most critical) severity among grouped findings.
Classification selection: use the most severe classification among grouped findings (Blocker > Critical > Quick Win > Enhancement).

Raw findings:
${indexedList}

Respond with a JSON object in this exact format (no extra text, no markdown prose outside the JSON):
\`\`\`json
{
  "merged": [
    {
      "title": "Short descriptive title (English)",
      "original_indices": [0, 1, 2],
      "merge_reason": "One sentence explaining why these were grouped",
      "severity": "P1",
      "classification": "Quick Win",
      "description": "Combined description synthesizing all grouped findings",
      "suggestion": "Actionable suggestion addressing the grouped issue",
      "ai_opportunity": null
    }
  ]
}
\`\`\`

Every index from 0 to ${findings.length - 1} must appear in exactly one group's original_indices array.`;

  let llmOutput;
  try {
    const { text } = await generateText({
      model: getModel('claude-sonnet'),
      prompt,
    });
    llmOutput = extractJson(text);
  } catch (err) {
    console.warn('[synthesizer] deduplicateFindings LLM/parse error:', err.message);
    console.warn('[synthesizer] Falling back to 1:1 mapping (no merges)');
    // Fallback: each finding becomes its own group
    const totalPersonas = job.personas.length;
    return findings.map((f, i) => ({
      id: `M-${i + 1}`,
      title: f.raw_data?.title || f.description?.slice(0, 80) || `Finding ${f.id}`,
      original_indices: [i],
      original_finding_ids: [f.id],
      merge_reason: 'No merge performed (fallback mode)',
      severity: f.severity,
      original_severity: f.severity,
      classification: f.classification,
      description: f.description,
      suggestion: f.raw_data?.suggestion || '',
      ai_opportunity: f.raw_data?.ai_opportunity || null,
      personas_affected: [f.persona.split(',')[0].trim()],
      consensus: `1/${totalPersonas}`,
    }));
  }

  const totalPersonas = job.personas.length;

  return llmOutput.merged.map((group, i) => {
    const affectedPersonaSet = new Set(
      group.original_indices.map(idx => findings[idx].persona.split(',')[0].trim())
    );
    const affectedCount = affectedPersonaSet.size;

    return {
      id: `M-${i + 1}`,
      title: group.title,
      original_indices: group.original_indices,
      original_finding_ids: group.original_indices.map(idx => findings[idx].id),
      merge_reason: group.merge_reason,
      severity: group.severity,
      original_severity: group.severity, // pre-calibration snapshot
      classification: group.classification,
      description: group.description,
      suggestion: group.suggestion,
      ai_opportunity: group.ai_opportunity ?? null,
      personas_affected: [...affectedPersonaSet],
      consensus: `${affectedCount}/${totalPersonas}`,
    };
  });
}

// ---------------------------------------------------------------------------
// discoverPatterns
// ---------------------------------------------------------------------------

/**
 * LLM call to find journey-level insights (cross-station patterns).
 * @param {object[]} calibratedFindings
 * @param {object} job
 * @returns {Promise<string[]>}
 */
async function discoverPatterns(calibratedFindings, job) {
  const stationSequence = job.plan?.stations
    ? job.plan.stations.map(s => `${s.id}: ${s.name}`).join(' → ')
    : '(station sequence unavailable)';

  const findingsSummary = calibratedFindings
    .map(
      f =>
        `${f.id} [${f.severity}] ${f.title} | stations: ${
          f.original_finding_ids
            .map(id => {
              const match = id.match(/S\d+/);
              return match ? match[0] : '?';
            })
            .join(',')
        } | personas: ${f.personas_affected.join(', ')} | consensus: ${f.consensus}`
    )
    .join('\n');

  const prompt = `You are a UX research analyst reviewing merged usability findings from a multi-persona website walkthrough.

Journey station sequence: ${stationSequence}

Merged findings (after deduplication and severity calibration):
${findingsSummary}

Identify 2–5 journey-level patterns. Examples of good patterns:
- "3/3 personas encountered friction at the S3→S5 transition"
- "All P1 issues cluster in the checkout flow (S4–S6)"
- "Mobile personas (Carlos, Kenji) face unique barriers at S2 and S7"

Rules:
- Each pattern must reference specific station IDs or finding IDs
- Each pattern must involve at least 2 findings or 2 stations
- Be specific and data-driven; avoid vague observations
- Write each pattern as a single concise sentence

Respond with a JSON array of strings (no extra prose):
\`\`\`json
["Pattern sentence 1", "Pattern sentence 2", ...]
\`\`\``;

  try {
    const { text } = await generateText({
      model: getModel('claude-sonnet'),
      prompt,
    });

    // Handle both array and object wrapping
    const parsed = extractJson(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.patterns)) return parsed.patterns;
    return [];
  } catch (err) {
    console.warn('[synthesizer] discoverPatterns error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// generateSummary
// ---------------------------------------------------------------------------

/**
 * LLM call to produce a 2–4 sentence executive summary.
 * @param {object[]} calibratedFindings
 * @param {string[]} journeyInsights
 * @param {object} job
 * @returns {Promise<string>}
 */
async function generateSummary(calibratedFindings, journeyInsights, job) {
  const totalIssues = calibratedFindings.length;
  const p0Count = calibratedFindings.filter(f => f.severity === 'P0').length;
  const p1Count = calibratedFindings.filter(f => f.severity === 'P1').length;
  const worstBlockers = calibratedFindings
    .filter(f => f.severity === 'P0' || f.severity === 'P1')
    .map(f => `"${f.title}" (${f.severity}, ${f.consensus})`)
    .join(', ');

  const insightsBullets = journeyInsights.length
    ? journeyInsights.map(i => `- ${i}`).join('\n')
    : '- No cross-station patterns identified';

  const prompt = `You are a UX research analyst. Write a concise executive summary (2–4 sentences) for a usability study of ${job.url || 'the website'}.

Study data:
- Total merged issues: ${totalIssues}
- P0 (critical blockers): ${p0Count}
- P1 (major issues): ${p1Count}
- Worst blockers: ${worstBlockers || 'none'}
- Personas evaluated: ${Array.isArray(job.personas) ? job.personas.join(', ') : job.personas}

Journey-level patterns:
${insightsBullets}

Requirements:
- Cover: total issue count, worst blocker(s), and the single most important pattern
- Be specific (mention issue titles or station IDs where helpful)
- Professional tone; no bullet points; prose only
- 2–4 sentences maximum

Respond with plain text only (no JSON, no markdown formatting).`;

  try {
    const { text } = await generateText({
      model: getModel('claude-sonnet'),
      prompt,
    });
    return text.trim();
  } catch (err) {
    console.warn('[synthesizer] generateSummary error:', err.message);
    return `The usability study identified ${calibratedFindings.length} issues across ${
      Array.isArray(job.personas) ? job.personas.length : 1
    } personas.`;
  }
}

// ---------------------------------------------------------------------------
// synthesizeFindings — main orchestrator
// ---------------------------------------------------------------------------

/**
 * Full post-execution synthesis pipeline.
 * @param {string} jobId
 * @param {object} job - job row (optional; will be fetched if not provided)
 */
async function synthesizeFindings(jobId, job) {
  // Allow callers to pass job directly or omit it
  if (!job) {
    job = await getJob(jobId);
    if (!job) throw new Error(`synthesizeFindings: job ${jobId} not found`);
  }

  // 1. Query all raw findings
  const { data: findings, error: findingsError } = await supabaseAdmin
    .from('findings')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  if (findingsError) throw new Error(`Failed to fetch findings: ${findingsError.message}`);

  // 2. Early return if no findings
  if (!findings || findings.length === 0) {
    console.log(`[synthesizer] No findings for job ${jobId}, skipping synthesis`);
    return;
  }

  console.log(`[synthesizer] Synthesizing ${findings.length} findings for job ${jobId}`);

  // 3. Deduplicate / merge
  const mergedRaw = await deduplicateFindings(findings, job);

  // 4. Calibrate severity on each merged finding
  const totalPersonas = Array.isArray(job.personas) ? job.personas.length : 1;
  const calibrated = mergedRaw.map(mf => {
    const affectedCount = mf.personas_affected.length;
    const calibratedSev = calibrateSeverity(mf.severity, affectedCount, totalPersonas);
    return {
      ...mf,
      severity: calibratedSev,
      original_severity: mf.original_severity, // preserved from dedup step
    };
  });

  // 5. Validate synthesis — collect warnings
  const warnings = validateSynthesis(calibrated, findings);
  if (warnings.length > 0) {
    console.warn(`[synthesizer] Synthesis warnings for job ${jobId}:`, warnings);
  }

  // 6. Discover cross-station patterns
  const journeyInsights = await discoverPatterns(calibrated, job);

  // 7. Generate executive summary
  const summary = await generateSummary(calibrated, journeyInsights, job);

  // 8. Insert into merged_findings table
  const rowsToInsert = calibrated.map(mf => ({
    id: mf.id,
    job_id: jobId,
    title: mf.title,
    severity: mf.severity,
    original_severity: mf.original_severity,
    classification: mf.classification,
    personas_affected: mf.personas_affected,
    consensus: mf.consensus,
    original_finding_ids: mf.original_finding_ids,
    merge_reason: mf.merge_reason,
    description: mf.description,
    suggestion: mf.suggestion,
    ai_opportunity: mf.ai_opportunity,
  }));

  const { error: insertError } = await supabaseAdmin
    .from('merged_findings')
    .insert(rowsToInsert);

  if (insertError) {
    throw new Error(`Failed to insert merged_findings: ${insertError.message}`);
  }

  console.log(`[synthesizer] Inserted ${rowsToInsert.length} merged findings for job ${jobId}`);

  // 9. Update job with journey insights, summary, and synthesis warnings in plan JSONB
  const existingPlan = job.plan || {};
  await updateJob(jobId, {
    plan: {
      ...existingPlan,
      journey_insights: journeyInsights,
      summary,
      synthesis_warnings: warnings,
    },
  });

  console.log(`[synthesizer] Synthesis complete for job ${jobId}`);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { synthesizeFindings, calibrateSeverity, validateSynthesis };
