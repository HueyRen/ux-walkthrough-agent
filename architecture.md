# UX Walkthrough Agent Architecture

## Overview

A reusable skill pipeline for automated UX experience walkthroughs. Users provide a **walkthrough flow** (user journey stages) and **user personas**, and the system outputs structured findings + interactive HTML reports.

Originally designed for Alibaba.com B2B (找-挑-询 journey), but generalizable to any product's user journey. Markdown configs are the model-agnostic interface -- the same configs work with Claude, Qwen, GPT, or any LLM with computer use.

**Canonical design doc**: See approved design at `~/.gstack/projects/HueyRen-ux-walkthrough-agent/huey-main-design-*.md`

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  /ux-walkthrough                                                     │
│                                                                      │
│  Phase A: Interactive Q&A (Configurator)                             │
│    Steps 1-5: Target → Personas → Rules → Route → Config Generation │
│    Output: instances/{project}/*.md                                  │
│                                                                      │
│  Phase B: Browser Walkthrough (Planner + Executors)                  │
│    Step 6:   Planner (Opus) dispatches Executors (Sonnet)            │
│    Step 7:   Per-station execution loop (navigate → screenshot →     │
│              evaluate → record issues → annotate)                    │
│    Step 7.5: audit_checker (text validation + screenshot remediation)│
│    Step 8:   Planner merge + cross-persona analysis                  │
│    Step 8.5: Task card feedback loop                                 │
│    Output: outputs/{project}/raw_report.html + manifest.json         │
│                                                                      │
│  Phase C: Raw Report Delivery                                        │
│    Step 9: Present raw_report.html + summary stats                   │
├──────────────────────────────────────────────────────────────────────┤
│  manifest.json (artifact contract)                                   │
├──────────────────────────────────────────────────────────────────────┤
│  /ux-present                                                         │
│                                                                      │
│  Phase D: Curation Q&A (3 mandatory + 2 optional questions)          │
│    Steps 1-4: Load findings → Feature selection → Exclusions →       │
│               Audience → Narrative shaping                           │
│                                                                      │
│  Phase E: Polished Presentation                                      │
│    Step 5: Generate presentation.html (self-contained HTML)          │
│    Step 6: Review + iterate with designer                            │
│    Output: outputs/{project}/presentation.html                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Key Architecture Decisions

### 1. Two-Skill Pipeline (not Monolithic)

`/ux-walkthrough` (Phases A-C) and `/ux-present` (Phases D-E) are separate skills connected by `manifest.json`. This allows:
- Re-running presentation without re-running walkthrough
- Different designers curating the same walkthrough data
- Independent testing and development

### 2. Planner (Opus) + Executor (Sonnet) Separation

Orchestration intelligence (persona assignment, cross-persona analysis, severity calibration) runs on Opus. Browser execution runs on Sonnet. This matches cost/capability to task complexity.

### 3. Browser Isolation Strategy (3-tier)

The Planner auto-detects the best available strategy:

| Tier | Method | Parallelism |
|------|--------|-------------|
| a) | Multiple MCP instances (`playwright-1`..`5`) | Full parallel |
| b) | Multi-tab within single MCP | Parallel within one process |
| c) | Sequential fallback | One persona at a time |

### 4. audit_checker (Self-Validation)

Two-phase validation after each station:
- **Phase 1 (text-only)**: Schema conformance check, auto-remediation of missing fields
- **Phase 2 (screenshot queue)**: Runs ONCE after all stations, captures missing screenshots with circuit breaker (max 1 attempt per field)

### 5. Task Card Flywheel

Each walkthrough produces `task_card_feedback.md` with improvement suggestions. Stations with high issue density get split; empty stations get merged; unused evaluation dimensions get flagged.

---

## File Structure

```
ux-walkthrough-agent/
├── skills/
│   ├── ux-walkthrough/
│   │   └── SKILL.md              # Full skill: Q&A → config → execution → raw report
│   └── ux-present/
│       └── SKILL.md              # Full skill: curation Q&A → polished HTML presentation
├── schema/
│   └── issue_schema.md           # Canonical issue data model (14 fields)
├── templates/                    # Reusable config templates (model-agnostic)
│   ├── system_instructions.template.md
│   ├── persona.template.md
│   ├── task_card.template.md
│   └── report_prompt.template.md
├── rules/                        # Evaluation rule libraries
│   └── b2b_ecommerce.rules.md
├── instances/                    # Generated instances (per-project configs)
│   └── {project}/
│       ├── config.md
│       ├── system_instructions.md
│       ├── personas.md
│       └── task_card_r1.md
└── outputs/                      # Walkthrough outputs
    └── {project}/
        ├── screenshots/          # JPEG, quality 80, max-width 1440px
        ├── findings/
        │   ├── findings_persona_{name}.md
        │   ├── findings_persona_{name}.json
        │   └── merged_findings.md
        ├── manifest.json         # Artifact contract between skills
        ├── raw_report.html       # Comprehensive raw material report
        └── presentation.html     # Polished stakeholder presentation
```

---

## Issue Schema (Summary)

Canonical definition: `schema/issue_schema.md`

14 fields per issue. Key fields:
- `id`: `P-S{N}-{NN}` format
- `severity`: P0 (blocker, weight 4) / P1 (severe, 3) / P2 (moderate, 2) / P3 (minor, 1)
- `classification`: Quick Win / Structural / Strategic
- `description`: First-person ("I searched for X, but...")
- `screenshot`: Issue screenshot filename in `./screenshots/`

---

## Screenshot Protocol

| Type | Pattern | Annotated? |
|------|---------|------------|
| Step shot | `r{round}_s{station}_step{NN}_{action}.jpg` | No -- raw page state |
| Issue shot | `r{round}_s{station}_issue_{NN}_{brief}.jpg` | Yes -- 3px red outline |

- Format: JPEG, quality 80, max-width 1440px, <200KB each
- Annotation timing: red border injection MUST happen same turn as discovery (ref_id staleness)
- Capture rate tracked in manifest.json; warning at <90%

---

## HTML Report Design System

Both reports are visual deliverables, not data dumps. Self-contained HTML with inline CSS/JS.

### Color System
```
Severity:   P0 #F44336  |  P1 #FF9800  |  P2 #FFC107  |  P3 #9E9E9E
Class:      Quick Win #4CAF50  |  Structural #2196F3  |  Strategic #9C27B0
Background: #FAFAFA main  |  #FFFFFF cards  |  #F5F5F5 code
Text:       #212121 primary  |  #757575 secondary
```

### Visual Components
- **Issue Cards**: 480px screenshot + severity badge (icon+text+color, WCAG 1.4.1) + persona dots
- **Temperature Heatmap**: persona groups (expandable) x journey sub-stages, pattern fill for accessibility
- **Journey Flow**: horizontal stage nodes with breakpoint markers
- **Screenshot Lightbox**: filmstrip navigation, severity-colored borders
- **Filter Bar**: multi-select by severity, classification, stage, persona
- **Appendix**: sortable table, paginated at 25/page

### Key Differences

| Aspect | `raw_report.html` | `presentation.html` |
|--------|-------------------|---------------------|
| Audience | Designer review | Stakeholder presentation |
| Content | All findings, all data | Curated top findings, narrative |
| Filmstrip | Chronological | Severity-sorted |

---

## Artifact Contract (manifest.json)

Written by `/ux-walkthrough` at end of Phase B. Read by `/ux-present` at Phase D start.

```json
{
  "project": "...",
  "walkthrough_date": "2026-05-09T14:30:00Z",
  "stations_total": 9,
  "stations_complete": 9,
  "personas": ["Lisa", "Carlos", "Wei"],
  "screenshots": {
    "step": { "expected": 99, "actual": 95, "capture_rate": 0.96 },
    "issue": { "expected": null, "actual": 32 }
  },
  "findings": {
    "total": 47,
    "by_severity": { "P0": 3, "P1": 7, "P2": 22, "P3": 15 }
  }
}
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Page load timeout | Retry once after 10s. If fails: P1 issue, error screenshot, continue |
| Navigation 404/5xx | P0 issue with error code, continue to next station |
| Browser crash | Restart, attempt next station. Repeat crash: halt, save partial |
| Cookie consent | Auto-dismiss (decline all). Can't dismiss: P2 issue, continue |
| Login wall | P1 issue, screenshot, skip gated content |
| CAPTCHA | Halt station, alert user for manual solve |
| Anti-bot | P0 issue, suggest non-headless mode |

---

## Distribution

Clone repo, symlink skills:

```bash
ln -s $(pwd)/skills/ux-walkthrough ~/.claude/skills/ux-walkthrough
ln -s $(pwd)/skills/ux-present ~/.claude/skills/ux-present
```

Invoke via `/ux-walkthrough` or `/ux-present` in Claude Code.

---

## Success Criteria

1. `/ux-walkthrough` generates valid configs from 5-minute Q&A
2. Browser executor completes 3-station walkthrough with >90% capture rate
3. Every step screenshot semantically named per convention
4. Issues conform to full 14-field schema
5. Raw report HTML self-contained, opens in any browser
6. `/ux-present` produces stakeholder-ready presentation in <10 min
7. Configs portable to other LLMs
8. audit_checker pass rate >95%
9. Cross-persona dedup reduces raw count by 15-30%
10. Task card feedback: at least 2 actionable suggestions per round

---

## Next Steps (Build Order)

1. **Executor loop** -- Single station, single persona, Playwright MCP. Validate: navigation, screenshots, schema conformance, audit_checker text phase.
2. **Multi-station sequential** -- All stations, one persona. Validate: state persistence, naming at scale, error handling.
3. **Planner + 2-persona merge** -- Cross-persona merge and deduplication via JSON findings.
4. **raw_report.html** -- With real findings, validate rendering and interactivity.
5. **`/ux-present`** -- Curation Q&A + polished HTML. Can parallel with steps 2-3.
6. **Q&A configurator** -- Phase A config generation. Can parallel with steps 1-3.
7. **End-to-end test** -- Full pipeline: Q&A -> walkthrough -> raw report -> curation -> presentation.
