---
name: ux-walkthrough
description: Automated UX experience walkthrough with persona-driven evaluation
---

# /ux-walkthrough -- UX Experience Walkthrough

Runs a structured UX walkthrough against any web product. Collects goals and personas through interactive Q&A, generates reusable Markdown config files, then dispatches browser agents to navigate, screenshot, and evaluate the product from each persona's perspective. Outputs a raw findings report ready for designer review.

## Prerequisites

- Playwright MCP configured in `claude.json` (required for browser execution)
- Write access to `instances/` and `outputs/` directories in the repo
- Optional: multiple Playwright MCP instances (`playwright-1` through `playwright-5`) for parallel persona execution

---

## Step 0: Initialize

Before starting Q&A, run these checks silently:

1. Detect available browser tools:
   - Check for `mcp__apply-bot-mcp__browser_navigate` (apply-bot MCP)
   - Check for `mcp__chrome-devtools__navigate_page` (chrome-devtools MCP)
   - Record which MCP is available for use in Phase B
   - If no browser MCP available: warn user and offer to complete Phase A only

2. Ask user for project name (used as directory name):
   - Slugify: lowercase, hyphens, no spaces (e.g., `alibaba-b2b`, `my-saas-app`)
   - Create directories: `instances/{project}/` and `outputs/{project}/screenshots/` and `outputs/{project}/findings/`

3. Check if `instances/{project}/config.md` already exists:
   - If yes: "I found an existing config for `{project}`. Resume with existing config, or restart Q&A?"
   - If no: proceed to Phase A

---

## Phase A: Interactive Q&A

Work through Steps 1-5 sequentially. After each step, confirm before moving to the next. The entire Q&A should take under 10 minutes.

---

### Step 1: Target & Scope

Ask:

> **What site or product do you want to walk through?**
> Please share: (1) the URL, (2) what the product does in one sentence, (3) any specific areas of concern or known pain points.

After receiving URL and description, auto-suggest journey stages based on site type:

**Site type detection heuristics:**
- B2B e-commerce (marketplace, wholesale): suggest `Find → Select → Inquire`
- Consumer SaaS / app: suggest `Discover → Evaluate → Onboard`
- E-commerce / D2C: suggest `Browse → Product → Checkout`
- Enterprise software: suggest `Discover → Trial → Activate`
- Marketplace / two-sided: suggest `Search → Compare → Transact`

Present suggestion and ask:

> Based on `{URL}`, I'd suggest this journey: **{auto-suggested stages}**
> Does this match your evaluation focus, or would you like to adjust the stages?
> You can also add sub-stages (e.g., `Find: F1 Homepage / F2 Search / F3 Filter Results`).

Collect and confirm:
- `site_url`: the target URL
- `site_name`: human-readable product name
- `journey_stages`: list of journey phases (e.g., `["Find", "Select", "Inquire"]`)
- `journey_sub_stages`: dict mapping stage → sub-stage codes (e.g., `{"Find": ["F1 Homepage", "F2 Search", "F3 Results", "F4 Filters"]}`)
- `focus_areas`: any specific concerns noted (free text)

---

### Step 2: Personas

Ask:

> **Do you have existing personas you'd like to use?**
> - Option A: Paste persona descriptions or point me to a file path
> - Option B: Let me help you build personas through a few questions
> - Option C: Use a generic set (Novice User / Experienced User / Power User) and refine later

**If Option A (bring your own):**
- Parse the provided personas and extract: name, role, experience level, goals, device
- Confirm the parsed list: "I identified these personas: [list]. Does this look right?"

**If Option B (interactive build):**
Ask for each persona (repeat up to 5 times, prompt to add more after each):

> **Persona {N}:**
> 1. Role/job title and context (e.g., "independent Amazon seller, 3 years experience")
> 2. Experience with this type of platform: New user / Platform-new but domain-experienced / Veteran
> 3. Primary goal for this session (what are they trying to accomplish?)
> 4. Key decision factors (what matters most to them: price / speed / trust / customization / specs?)
> 5. Device: Desktop (what width?) / Mobile / Both

After collecting, generate a persona summary card in the format of `templates/persona.template.md` and confirm.

**V1 limit:** Maximum 5 active personas. If user wants more, note them in config but mark as inactive for this run.

---

### Step 3: Evaluation Criteria

Present available rule sets:

> **Which evaluation framework should I use?**
> Available rule sets:
> - `b2b_ecommerce` -- B2B marketplace evaluation (MOQ clarity, trust signals, inquiry flow, 22+ rules)
> - `custom` -- I'll help you define criteria from scratch
>
> Or describe your evaluation priorities and I'll match rules automatically.

If user selects `b2b_ecommerce` or a named rule set:
- Load from `rules/{set_name}.rules.md`
- Show summary: "This rule set covers: [top 5 rule categories from file]"
- Ask: "Any additional focus areas? (e.g., AI features, mobile, accessibility)"

If user provides custom priorities:
- Map to nearest rules in the available library
- Flag any coverage gaps: "I don't have rules for X -- I'll note issues I observe but without formal criteria"

Collect:
- `rule_set`: filename reference (e.g., `b2b_ecommerce`)
- `additional_focus`: any extra evaluation dimensions
- `severity_threshold`: minimum severity to report (default: P3 and above = all issues)

---

### Step 4: Walkthrough Route

Generate a station-by-station task card based on journey stages and personas. Present it to the user:

> Here's the walkthrough route I've generated:
>
> **Station S1: {Stage} -- {Page Name}**
> Main persona: {Persona A} | Supporting: {Persona B}
> Operations: [list 4-6 key actions]
>
> **Station S2: ...**
> ...
>
> Total: {N} stations, estimated {N*25} minutes of execution time.
> Does this route cover what you need? You can add, remove, or reorder stations.

Generation logic:
- Map each journey sub-stage to one station
- Assign primary persona based on: who is most affected by this stage
- Assign supporting personas (up to 2 additional) based on journey relevance
- Generate 4-8 operations per station, specific to the page type
- Include Discovery Mode flag for any persona with "new user" experience level

Collect confirmation or adjustments before proceeding to Step 5.

---

### Step 5: Config Generation

Write all config files to `instances/{project}/`. Print each file as it's written.

**Files to generate:**

**`instances/{project}/config.md`**
```markdown
# Walkthrough Config -- {site_name}

- project: {project}
- site_url: {site_url}
- site_name: {site_name}
- journey_stages: {journey_stages}
- rule_set: {rule_set}
- round: r1
- walkthrough_date: {today}
- active_personas: {persona names list}
- focus_areas: {focus_areas}
```

**`instances/{project}/system_instructions.md`**
Fill `templates/system_instructions.template.md` replacing all `{{VARIABLE}}` placeholders:
- `{{SITE_URL}}` → site_url
- `{{JOURNEY_STAGES}}` → journey stage arrow string
- `{{JOURNEY_SUB_STAGES}}` → sub-stage definitions
- `{{PERSONA_LIST}}` → persona names and one-line descriptions
- `{{PLATFORM_TERMINOLOGY}}` → any domain-specific terms to flag (from rule set or user input)

**`instances/{project}/personas.md`**
Fill `templates/persona.template.md` for each persona. Each persona gets:
- Background, goals, experience level, device, decision factors
- Tag fields for rule matching: `experience=new|intermediate|expert`, `decision_speed=fast|medium|slow`, `price_sensitivity=high|medium|low`
- Discovery Mode flag: YES for new-user personas

**`instances/{project}/task_card_r1.md`**
Fill `templates/task_card.template.md` with the walkthrough route from Step 4:
- Round ID: `r1`
- Station blocks with all operations, screenshot names, persona evaluation dimensions
- Screenshot checklist at bottom of each station block

After writing all files, print:
```
Config generated:
  instances/{project}/config.md
  instances/{project}/system_instructions.md
  instances/{project}/personas.md
  instances/{project}/task_card_r1.md

Ready to begin walkthrough execution? (yes / not yet -- I want to review the configs first)
```

---

## Phase B: Browser Walkthrough Execution

---

### Step 6: Planner Dispatch

The Planner (current agent, using full context) reads all instance configs and decides execution strategy.

**Browser isolation detection (in order of preference):**

1. **Multiple MCP instances**: If `playwright-1`, `playwright-2`, etc. are configured in `claude.json`, assign one MCP instance per persona -- full parallel execution
2. **Multi-tab within single MCP**: Open separate browser tabs for each persona, track tab IDs -- parallel within one browser process
3. **Sequential fallback**: Single browser, run one persona at a time reusing the same session -- reliable but slower

Announce strategy:
```
Execution strategy: {parallel/sequential}
Personas: {list}
Stations: {count}
Estimated time: {count * personas * 3} minutes
Starting execution...
```

**Persona-to-station assignment matrix:**
- Read task card to determine which persona is primary/supporting at each station
- For sequential execution: run all stations for Persona 1, then all stations for Persona 2, etc.
- For parallel: spawn subagent per persona, each runs all its assigned stations

**Each Executor receives (as context injection):**
- Full text of `instances/{project}/system_instructions.md`
- Full text of their assigned persona from `instances/{project}/personas.md`
- Full text of `instances/{project}/task_card_r1.md`
- Output paths: `outputs/{project}/screenshots/` and `outputs/{project}/findings/`

---

### Step 7: Per-Station Execution Loop

For each station in the task card, the Executor follows this protocol:

**7.1 Navigate and stabilize**
```
browser_navigate(url="{station_target_url}")
browser_wait_for(condition="networkidle", timeout=15000)
```
If timeout: wait 10s, retry once. If still fails: record as P1 issue, take error-state screenshot, continue to next step.

**7.2 Take step screenshot (immediately after navigation)**
```
browser_take_screenshot(
  path="outputs/{project}/screenshots/r1_s{N}_step01_navigate.jpg",
  quality=80,
  full_page=True
)
```
Screenshot format: JPEG, quality 80, max-width 1440px. Filename follows pattern: `r{round}_s{station}_step{NN}_{action}.jpg`

**7.3 Execute station operations**
For each operation in the task card:
1. Execute the action (click, fill, scroll, hover as specified)
2. Wait for page stability: `browser_wait_for(condition="networkidle", timeout=5000)`
3. Take step screenshot immediately: `r{round}_s{station}_step{NN}_{action_slug}.jpg`
4. Evaluate from persona's cognitive lens (see 7.4)

**7.4 Per-page evaluation protocol**
After each action, evaluate against:
- Applicable heuristic rules from the rule set (match by `persona:*`, `stage:*`, `priority:critical` first)
- Persona's stated goals and decision factors
- Cognitive model: what would this persona understand or be confused by?

For new-user personas (Discovery Mode = YES):
- Record every "uncertain next step" moment as at minimum a P3 issue
- Do NOT use platform knowledge to shortcut navigation -- simulate not knowing

**7.5 TERM_FLAG protocol**
When encountering platform-specific terminology:
```
[TERM_FLAG] Term: "{term}" | Location: {page area} | New user risk: High/Medium/Low -- {explanation}
```
Terms to always flag: any jargon, acronyms, or platform-specific concepts the persona would not know.

**7.6 AI_EVAL protocol**
When encountering AI-powered features:
```
[AI_EVAL] Feature: {name} | Location: {page/entry} | Trigger: {how activated} | Performance: {description} | Score: 1-5 | New user value: High/Medium/Low
```

**7.7 Issue recording (on discovery)**
When an issue is identified:

1. IMMEDIATELY (before any navigation or scrolling): identify the problem element
   - Use accessibility tree to find element ref_id
   - Inject red border: `browser_evaluate(script="document.querySelector('{selector}').style.outline = '3px solid red'")`
   - Take issue screenshot: `r{round}_s{station}_issue_{NN}_{brief}.jpg`
   - Reset style: `browser_evaluate(script="document.querySelector('{selector}').style.outline = ''")`
   - If element is missing: screenshot expected location, annotate with "MISSING" text

2. Record issue in findings with full schema:
```json
{
  "id": "P-S{N}-{NN}",
  "title": "{one-line title}",
  "station": "S{N} {station_name}",
  "journey_stage": "{Find/Select/Inquire/...}",
  "sub_stage": "{F1/S2/I3/...}",
  "personas_affected": ["{primary_persona}*", "{secondary_persona}"],
  "severity": "{P0/P1/P2/P3}",
  "classification": "{Quick Win/Structural/Strategic}",
  "description": "I {action}, but {observed problem}...",
  "repro_steps": ["1. {step}", "2. {step}", "3. {step}"],
  "impact": "{specific effect on this persona's goal or decision}",
  "screenshot": "r{round}_s{station}_issue_{NN}_{brief}.jpg",
  "suggestion": "{concrete improvement or 'no suggestion'}",
  "ai_opportunity": "{yes/no -- brief explanation}"
}
```

**Critical annotation timing constraint:** Red border injection and screenshot MUST happen in the same interaction turn as issue discovery, before any further navigation or scrolling. The accessibility tree ref_id is session-local and changes on any DOM mutation (AJAX, lazy load, SPA navigation). Fallback: if ref_id is stale, use CSS selector (data attributes, class+nth-child) instead of ref_id.

**7.8 Station completion**
After all operations for a station:
1. Output station findings block (see format below)
2. Output screenshot checklist for the station
3. Print progress line: `[{Persona}] Station S{N} complete: {issue_count} issues, {screenshot_count} screenshots`

**Per-station findings format:**
```markdown
## Station S{N}: {station_name}
**Persona**: {name} | **Time**: {timestamp} | **Cognitive Load**: {1-5}

### Operations Log
{step-by-step actions with screenshot filenames}

### Issues Found
{issues in markdown format, sorted P0→P3}

### AI Feature Observations
{AI_EVAL entries if any}

### Term Flags
{TERM_FLAG entries if any}

### Screenshot Checklist
| Type | Filename | Status |
|------|----------|--------|
| Step | r1_s{N}_step01_navigate.jpg | ✅ |
...
```

---

### Step 7.5: Station Validation (audit_checker)

Run after completing each station. Two phases:

**Phase 1 -- Text-only schema check (no browser interaction):**

For each issue recorded at this station, verify:
- [ ] `id` matches pattern `P-S{N}-{NN}`
- [ ] `severity` is one of: P0, P1, P2, P3
- [ ] `classification` is one of: Quick Win, Structural, Strategic
- [ ] `screenshot` filename is recorded (existence confirmed in Phase 2)
- [ ] `impact` field references this persona's specific goal or decision factor
- [ ] `suggestion` is present OR explicitly set to `"no suggestion"`
- [ ] `repro_steps` has at least 2 steps

**Text-only auto-remediation:**
- Missing `suggestion`: generate from the matching heuristic rule in the rule set. If no rule matches, generate from the description context.
- Missing `impact` / weak `impact`: infer from persona's decision factors (e.g., "This impacts {persona}'s ability to {goal}")
- Missing or malformed `id`: auto-assign next available sequence number
- After one remediation attempt: if still failing, mark field `[INCOMPLETE]` and move on

**Phase 2 -- Screenshot remediation queue (runs ONCE after ALL stations complete):**
- Collect all issues with `[MISSING_SCREENSHOT]` flags across all stations
- For each: navigate to the recorded URL, attempt screenshot capture
- Circuit breaker: max 1 attempt per missing screenshot
- If capture fails: mark issue screenshot as `[INCOMPLETE]` with note "screenshot unavailable -- page state may have changed"
- Warning note in findings: page state may differ from original discovery moment

**audit_checker report (appended to station output):**
```
audit_checker S{N}: {pass_count}/{total_count} issues fully valid
  Remediated: {count} fields auto-fixed
  Incomplete: {count} fields marked [INCOMPLETE]
```

---

### Step 8: Planner Merge + Cross-Persona Analysis

After all Executor agents complete all stations, the Planner:

**8.1 Load all persona findings**
Read all `outputs/{project}/findings/findings_persona_*.json` files.

**8.2 Cross-persona pattern detection**
For each unique issue location/type:
- Count how many personas encountered the same issue at the same location
- `≥3 personas affected`: mark for severity upgrade consideration (one level up)
- `Only 1 specialized persona affected`: confirm or downgrade severity one level
- Record cross-persona evidence string: `"{N}/{total} personas affected"`

**8.3 Deduplication**
When multiple persona findings describe the same issue:
- Keep the highest-severity version as canonical
- Merge `personas_affected` arrays (union)
- Add cross-persona count badge: `3/5 personas`
- Remove duplicate entries from individual persona findings

**8.4 Severity calibration**
After deduplication:
- Re-evaluate P0/P1 issues with cross-persona data
- Issues affecting ≥3 personas that were P2: document upgrade rationale
- Issues affecting only 1 niche persona that were P1: document if downgrade warranted
- Do NOT downgrade P0 issues (blockers are blockers regardless of persona count)

**8.5 Write merged findings**

Write `outputs/{project}/findings/merged_findings.md`:
```markdown
# Merged Findings -- {project}

## Summary
- Total issues (pre-dedup): {N}
- After deduplication: {N}
- By severity: P0: {N} | P1: {N} | P2: {N} | P3: {N}
- By classification: Quick Win: {N} | Structural: {N} | Strategic: {N}

## Cross-Persona Patterns
{list of issues with ≥2 personas affected, with evidence}

## Severity Upgrades Applied
{list of upgrades with rationale}

## All Issues (Merged, Severity-sorted)
{full issue list in markdown schema format}
```

**8.6 Generate temperature heatmap data**
For each cell (persona_group × journey_sub_stage):
- Weighted score = sum(P0×4 + P1×3 + P2×2 + P3×1)
- Color: 0=green(#4CAF50), 1-3=yellow(#FFC107), 4-7=orange(#FF9800), 8+=red(#F44336)
- Default view: persona groups (expandable to individuals on click)

**8.7 Generate raw_report.html**

Create `outputs/{project}/raw_report.html` -- a self-contained HTML file with inline CSS and JS.

Design system (from canonical spec):
```
Colors:   P0 #F44336 | P1 #FF9800 | P2 #FFC107 | P3 #9E9E9E
Class:    Quick Win #4CAF50 | Structural #2196F3 | Strategic #9C27B0
BG:       #FAFAFA main | #FFFFFF cards | #F5F5F5 code
Text:     #212121 primary | #757575 secondary
Font:     system-ui, -apple-system, sans-serif
Scale:    12px caption | 14px body | 18px h3 | 24px h2 | 32px h1
Grid:     8px unit | 24px card padding | 48px section gap
Cards:    border-radius 8px | box-shadow 0 1px 3px rgba(0,0,0,0.12)
```

Report structure:
1. **Stats dashboard**: total issues, P0/P1 count, coverage %, walkthrough date, personas used
2. **Temperature heatmap**: interactive HTML table (X=sub-stages, Y=persona groups)
   - Hover on cell: popover with step screenshot thumbnail from that stage+persona
   - Click cell: filters issue list to that cell
   - Expandable persona groups (click group row → show individual personas)
   - Cells include pattern fill (hatching) for color-blind accessibility
3. **Issue cards** (all issues, chronological order, toggle to severity-sorted):
   - 480px-wide screenshot inline + cropped detail at 2x zoom
   - Severity badge: icon + text + color (WCAG 1.4.1): `[!!! P0 Blocker]` / `[!! P1 Severe]` / `[! P2 Moderate]` / `[P3 Minor]`
   - Persona indicator dots (avatar circles) showing affected personas, tooltip on hover
   - Classification tag: Quick Win (green) / Structural (blue) / Strategic (purple)
   - Cross-persona count badge: `3/5 personas`
   - Expandable: click to show full schema, repro steps, AI opportunity
4. **Filter bar**: multi-select by severity, classification, journey stage, persona -- instant client-side filtering
5. **Screenshot lightbox**: click any screenshot → full-size with filmstrip navigation
   - Chronological filmstrip order (raw report = designer review)
   - Severity-colored borders on issue screenshots
6. **AI features log**: all AI_EVAL entries by station
7. **Term flags log**: all TERM_FLAG entries with risk level
8. **Full appendix**: collapsible raw issue table with all 14 schema fields (paginated at 25 per page)

Implementation:
- Issue data injected as JSON in `<script>` tag, rendered by client-side JS
- Screenshots via relative `./screenshots/` paths
- Total JS budget: <500 lines (filter + sort + lightbox + heatmap hover)
- No frameworks, no CDN, no build step
- `@media print` CSS for clean PDF export

Edge cases:
- Zero issues at a station: green "No issues found" card with step screenshot as positive evidence
- Broken/missing screenshot: gray placeholder box with "Screenshot unavailable" text
- 50+ total issues: paginate appendix at 25/page, heatmap and top cards unchanged
- Single persona: heatmap collapses to single row, no group expand

---

### Step 8.5: Task Card Feedback Loop

After generating the report, the Planner analyzes issue distribution and outputs improvement suggestions:

Write `outputs/{project}/task_card_feedback.md`:
```markdown
# Task Card Feedback -- r1

## Suggested Changes

### Split Recommended
{stations with ≥8 issues -- suggest splitting into sub-stations}

### Merge Recommended
{stations with 0 issues AND logically adjacent -- suggest merging}

### Evaluation Dimension Cleanup
{persona evaluation dimensions in the task card that triggered 0 issues -- consider rephrasing or removing}

### New Heuristic Patterns
{issue patterns observed during walkthrough that aren't covered by current rule set -- suggest adding}
```

Present to user: "Here are suggested improvements to the task card for your next round. Apply any before running r2."

---

## Phase C: Raw Report Delivery

---

### Step 9: Present Results

1. Open the raw report in browser:
   ```
   browser_navigate(url="file:///{absolute_path}/outputs/{project}/raw_report.html")
   ```

2. Print summary to conversation:
   ```
   Walkthrough complete.

   Project: {project}
   Stations completed: {N}/{total} ({incomplete_list if any})
   Personas: {list}
   Total issues: {N} ({P0} P0, {P1} P1, {P2} P2, {P3} P3)
   Screenshots: {step_count} step + {issue_count} issue = {total} total
   Capture rate: {rate}% ({warning if <90%})

   Top P0/P1 findings:
   {bullet list of up to 5 highest-severity issues, one line each}

   Raw report: outputs/{project}/raw_report.html
   Next: run /ux-present to create a stakeholder presentation.
   ```

3. If capture rate < 90%, add warning:
   ```
   Warning: Screenshot capture rate is {rate}%. {count} screenshots missing.
   Check the manifest for details: outputs/{project}/manifest.json
   ```

---

## Error Handling Reference

| Scenario | Behavior |
|----------|----------|
| Page load timeout (>15s) | Retry once after 10s. If still fails: record P1 issue "Page failed to load", take error-state screenshot, continue to next step. |
| Navigation failure (404, 5xx) | Record P0 issue with error code, take screenshot of error page, continue to next station. |
| Browser crash | Restart browser, attempt next station. If crash repeats: halt, save partial findings, alert user with partial results path. |
| Partial station completion | Save all findings collected so far, mark station `INCOMPLETE` in manifest, continue to next station. |
| Screenshot capture failure | Log warning, increment missed count, continue. Track in manifest. |
| Cookie consent banner | Auto-dismiss (decline all cookies). If cannot dismiss: screenshot the banner, record P2 issue "Cookie banner blocks evaluation", continue. |
| Login wall | Screenshot the wall. Record P1 issue "Content gated behind login -- {N} steps blocked". Skip gated content, continue with accessible content. |
| CAPTCHA | Halt current station. Save partial findings. Alert user: "CAPTCHA detected at S{N}. Please solve manually and type 'continue' to resume, or 'skip' to move to next station." |
| Anti-bot detection | Record P0 issue "Anti-bot detection triggered -- evaluation blocked". Alert user: "Playwright appears to be fingerprinted. Try non-headless mode or manual walkthrough for this station." |

---

## Artifact Contract (manifest.json)

Write `outputs/{project}/manifest.json` at the end of Phase B. This file is read by `/ux-present`:

```json
{
  "project": "{project}",
  "walkthrough_date": "{ISO timestamp}",
  "stations_total": {N},
  "stations_complete": {N},
  "stations_incomplete": [],
  "personas": ["{name1}", "{name2}"],
  "screenshots": {
    "step": { "expected": {N}, "actual": {N}, "capture_rate": 0.0 },
    "issue": { "expected": null, "actual": {N} }
  },
  "findings": {
    "total": {N},
    "by_severity": { "P0": 0, "P1": 0, "P2": 0, "P3": 0 },
    "incomplete_fields": 0
  },
  "files": [
    { "path": "findings/findings_persona_{name}.md", "status": "complete" },
    { "path": "findings/findings_persona_{name}.json", "status": "complete" },
    { "path": "findings/merged_findings.md", "status": "complete" },
    { "path": "raw_report.html", "status": "complete" }
  ]
}
```

---

## Issue Schema Reference

Every issue must conform to this schema (canonical source: `schema/issue_schema.md`):

| Field | Required | Notes |
|-------|----------|-------|
| `id` | Yes | `P-S{N}-{NN}` format |
| `title` | Yes | One-line |
| `station` | Yes | Station name |
| `journey_stage` | Yes | e.g., Find / Select / Inquire |
| `sub_stage` | Yes | e.g., F1, S2, I3 |
| `personas_affected` | Yes | List, `*` marks primary |
| `severity` | Yes | P0 / P1 / P2 / P3 |
| `classification` | Yes | Quick Win / Structural / Strategic |
| `description` | Yes | First-person ("I searched for X, but...") |
| `repro_steps` | Yes | Min 2 steps |
| `impact` | Yes | Must reference persona's business goal |
| `screenshot` | Yes | Filename in `./screenshots/` |
| `suggestion` | No | Or explicit `"no suggestion"` |
| `ai_opportunity` | No | `"yes -- {brief}"` or `"no"` |

---

## Screenshot Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Step shot | `r{round}_s{station}_step{NN}_{action}.jpg` | `r1_s1_step01_navigate.jpg` |
| Issue shot | `r{round}_s{station}_issue_{NN}_{brief}.jpg` | `r1_s1_issue_01_nav_overflow.jpg` |

Rules: JPEG quality 80, max-width 1440px, under 200KB each. Step seq: two-digit zero-padded. Action and brief: English lowercase underscores, max 5 words.
