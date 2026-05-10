---
name: ux-present
description: Curate walkthrough findings into a polished stakeholder presentation
---

# /ux-present — UX Walkthrough Presentation

Transforms raw `/ux-walkthrough` findings into a stakeholder-ready `presentation.html` through designer curation and narrative shaping.

## Prerequisites

- `/ux-walkthrough` must have run and produced `outputs/{project}/manifest.json`
- Required files: `manifest.json`, `findings/merged_findings.md`, `findings/findings_persona_*.json`, `screenshots/`
- Issue schema reference: `schema/issue_schema.md`

---

## Step 0: Identify Project

Ask the user which project to present:

> "Which project would you like to present? (Check `outputs/` for available projects)"

List subdirectories in `outputs/` if the user is unsure. Set `{project}` to the chosen name. All paths below are relative to `outputs/{project}/`.

---

## Step 1: Load and Validate Findings

Read `manifest.json`. Extract:
- `stations_total`, `stations_complete`, `stations_incomplete`
- `personas` list
- `findings.total`, `findings.by_severity` (P0/P1/P2/P3)
- `screenshots.step.capture_rate`
- `files` array (check `status` for each)

**Completeness checks:**

| Check | Threshold | Action if failed |
|-------|-----------|-----------------|
| Stations complete | `stations_complete == stations_total` | Warn: "X of Y stations complete. Missing: [list]. Proceed?" |
| Screenshot capture rate | `>= 0.90` | Warn: "Capture rate {rate}%. Some findings may lack screenshots." |
| merged_findings.md exists | status == "complete" | Error: "merged_findings.md missing. Re-run /ux-walkthrough Phase C first." |
| findings_persona_*.json exist | at least one | Error: "No persona JSON files found. Cannot build presentation." |
| incomplete_fields | `< 5%` of total issues | Warn only, note count |

Read `findings/merged_findings.md` and all `findings/findings_persona_*.json` files.

Parse all issues into memory. Build a flat array of issue objects conforming to `schema/issue_schema.md`.

**Print findings summary to the user:**

```
Findings loaded: {total} issues across {stations_complete} stations, {N} personas
  P0 Blockers:  {n}
  P1 Severe:    {n}
  P2 Moderate:  {n}
  P3 Minor:     {n}

Personas: {comma-separated list}
Screenshot capture rate: {rate}%
```

---

## Phase D: Curation Q&A

### Step 2: Present Findings for Curation

Show a ranked list of all P0 and P1 issues (title + severity + affected personas + station):

```
TOP ISSUES (P0 + P1) — ranked by severity then cross-persona coverage:

 1. [P0] {title} — {station} — affects: {personas}
 2. [P0] {title} — {station} — affects: {personas}
 3. [P1] {title} — {station} — affects: {personas}
 ...

P2/P3 issues available in full list ({n} total).
```

### Step 3: Curation Decisions (3 mandatory questions)

Ask each question in sequence. Wait for response before proceeding.

**Question 1 — Featured findings:**

> "Which findings should be featured in your Top 10?
>
> You can say: 'the top 10 by severity', 'issues 1, 3, 5, 7, 9, 11, 13, 15, 17, 20', or name specific issues. I'll use severity + persona coverage as the default ranking if you want me to choose."

Capture: list of issue IDs or natural-language selection. If "auto" or no preference: select top 10 by (severity weight × personas_affected count), breaking ties by station order.

**Question 2 — Exclusions:**

> "Anything to exclude or deprioritize? (These will move to the appendix, not disappear.)
>
> Common reasons: out of scope, already fixed, duplicate of another issue, not relevant for this audience."

Capture: issue IDs to demote. If none: continue.

**Question 3 — Audience:**

> "Who is the primary audience for this presentation?
>
>   A) Executive / business leadership — high-level story, business impact, clear recommendations
>   B) Design team — full design rationale, interaction detail, before/after suggestions
>   C) Engineering — repro steps, technical scope, effort classification

Capture: audience type. Set `{audience}` = exec | design | eng.

Audience affects:
- **exec**: hide repro steps, lead with business impact, emphasize Quick Win vs Strategic split
- **design**: show full issue detail, interaction suggestions, persona cognitive model references
- **eng**: show repro steps, classification tags (Quick Win = fast ship, Structural = arch work), effort signals

### Step 4: Narrative Shaping (2 optional questions)

Ask:

> "Do you want to shape the narrative opening? (Takes ~2 minutes)
>
>   Y — I'll ask 2 quick questions to craft a custom executive summary
>   N — Auto-generate from your Top 10 selection (faster)"

If **N** or "fast" or similar: skip to Step 5. Set `{narrative_mode}` = auto.

If **Y**: set `{narrative_mode}` = custom. Ask:

**Question 4:**

> "What was the most surprising finding? (This becomes the opening hook for executives.)"

Capture: free-text description. Will be placed in the hero section as a pull quote.

**Question 5:**

> "What story should the opening tell?
>
>   Examples: 'Users are failing at their first search — discovery is broken before they even reach product pages.'
>   Or: 'The journey works fine for experts but creates 8 blockers for first-time buyers.'"

Capture: narrative framing sentence. Used as the executive summary lede.

---

## Phase E: Polished Presentation Generation

### Step 5: Generate presentation.html

Collect all screenshot paths from `screenshots/`. Build the following data structures in memory before generating HTML:

**`ISSUES_DATA`** — JSON array of all issues (from parsed findings JSON files):
```json
[
  {
    "id": "P-S1-01",
    "title": "...",
    "station": "S1 Homepage",
    "journey_stage": "Find",
    "sub_stage": "F1",
    "personas_affected": ["Lisa*", "Carlos"],
    "severity": "P2",
    "classification": "Structural",
    "description": "...",
    "repro_steps": ["1. ...", "2. ..."],
    "impact": "...",
    "screenshot": "r1_s1_issue_01_nav_overflow.jpg",
    "suggestion": "...",
    "ai_opportunity": "...",
    "featured": true,
    "rank": 3
  }
]
```

Add `"featured": true/false` based on Step 3 Q1 selection. Add `"rank": N` (1-10 for featured). Add `"excluded": true` for demoted issues.

**`MANIFEST_DATA`** — summary stats for hero section:
```json
{
  "project": "...",
  "walkthrough_date": "...",
  "total": 47,
  "by_severity": { "P0": 3, "P1": 7, "P2": 22, "P3": 15 },
  "stations": 9,
  "personas": ["Lisa", "Carlos", "Wei"],
  "capture_rate": 0.96,
  "audience": "exec",
  "narrative_mode": "auto"
}
```

**`HEATMAP_DATA`** — computed weighted scores per persona × sub_stage cell:
```json
{
  "personas": ["Lisa", "Carlos", "Wei"],
  "sub_stages": ["F1", "F2", "S1", "S2", "I1"],
  "cells": {
    "Lisa:F1": { "score": 7, "issues": ["P-S1-01", "P-S1-03"], "screenshot": "r1_s1_step02_search.jpg" },
    "Carlos:S2": { "score": 12, "issues": ["P-S3-01"], "screenshot": "r1_s3_step01_navigate.jpg" }
  }
}
```

Cell score = sum of (P0×4 + P1×3 + P2×2 + P3×1) for issues at that persona × sub_stage intersection.

**`NARRATIVE`** — executive summary text:
- If `narrative_mode == "auto"`: generate from top featured issues, leading with the highest-severity P0 finding, or if none, the P1 with most persona coverage.
- If `narrative_mode == "custom"`: use Q4 answer as opening hook quote, Q5 answer as lede.
- Always end with: "This walkthrough identified {n} actionable improvements: {quick_win_count} Quick Wins, {structural_count} Structural changes, and {strategic_count} Strategic opportunities."

Now write the complete `presentation.html` file using the template below. Inject all data structures as JSON in `<script>` tags.

---

### HTML Template

Generate the file at `outputs/{project}/presentation.html`. The complete structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{PROJECT_NAME}} — UX Walkthrough Presentation</title>
  <style>
    /* ── Reset & Base ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px; line-height: 1.5;
      background: #FAFAFA; color: #212121;
    }

    /* ── Typography Scale ── */
    h1 { font-size: 32px; font-weight: 700; line-height: 1.2; }
    h2 { font-size: 24px; font-weight: 600; line-height: 1.2; }
    h3 { font-size: 18px; font-weight: 600; line-height: 1.2; }
    .caption { font-size: 12px; color: #757575; }
    .stat-number { font-size: 32px; font-weight: 700; }
    .secondary { color: #757575; }

    /* ── Spacing & Layout ── */
    .section { padding: 48px 0; }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
    .card {
      background: #FFFFFF; border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12); padding: 24px;
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }

    /* ── Top Nav ── */
    .nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      background: #FFFFFF; border-bottom: 1px solid #E0E0E0;
      padding: 0 24px; height: 56px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .nav-title { font-weight: 600; font-size: 15px; }
    .nav-links { display: flex; gap: 24px; }
    .nav-links a { color: #757575; text-decoration: none; font-size: 14px; }
    .nav-links a:hover { color: #212121; }
    body { padding-top: 56px; }

    /* ── Severity Colors ── */
    .sev-p0 { color: #F44336; }
    .sev-p1 { color: #FF9800; }
    .sev-p2 { color: #FFC107; }
    .sev-p3 { color: #9E9E9E; }
    .bg-p0 { background: #F44336; color: #fff; }
    .bg-p1 { background: #FF9800; color: #fff; }
    .bg-p2 { background: #FFC107; color: #212121; }
    .bg-p3 { background: #9E9E9E; color: #fff; }

    /* ── Classification Colors ── */
    .cls-qw { background: #E8F5E9; color: #2E7D32; border: 1px solid #A5D6A7; }
    .cls-st { background: #E3F2FD; color: #1565C0; border: 1px solid #90CAF9; }
    .cls-sg { background: #F3E5F5; color: #6A1B9A; border: 1px solid #CE93D8; }

    /* ── Severity Badge ── */
    .sev-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;
    }
    .sev-badge .icon { font-size: 14px; }

    /* ── Hero Section ── */
    .hero { background: #212121; color: #FFFFFF; padding: 64px 0 48px; }
    .hero h1 { margin-bottom: 8px; }
    .hero .subtitle { color: #BDBDBD; margin-bottom: 32px; font-size: 16px; }
    .hero .narrative {
      font-size: 18px; line-height: 1.6; color: #E0E0E0;
      border-left: 3px solid #FF9800; padding-left: 16px;
      margin-bottom: 40px; max-width: 720px;
    }
    .stats-row { display: flex; gap: 32px; flex-wrap: wrap; }
    .stat-block { text-align: center; }
    .stat-block .stat-number { font-size: 40px; }
    .stat-block .stat-label { font-size: 12px; color: #9E9E9E; text-transform: uppercase; letter-spacing: 0.5px; }

    /* ── Journey Flow ── */
    .journey-flow { display: flex; align-items: center; gap: 0; overflow-x: auto; padding: 24px 0; }
    .stage-node {
      flex: 0 0 auto; min-width: 120px; padding: 12px 16px;
      border-radius: 8px; text-align: center; position: relative;
      cursor: pointer; transition: transform 0.15s;
    }
    .stage-node:hover { transform: translateY(-2px); }
    .stage-node .stage-name { font-weight: 600; font-size: 14px; }
    .stage-node .stage-score { font-size: 20px; font-weight: 700; margin: 4px 0; }
    .stage-node .stage-issues { font-size: 12px; }
    .stage-node.healthy { background: #E8F5E9; color: #2E7D32; }
    .stage-node.caution { background: #FFF8E1; color: #F57F17; }
    .stage-node.breakpoint { background: #FFEBEE; color: #C62828; }
    .stage-node.breakpoint::after {
      content: ''; position: absolute; top: -4px; right: -4px;
      width: 10px; height: 10px; background: #F44336; border-radius: 50%;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(244,67,54,0.6); }
      70% { box-shadow: 0 0 0 8px rgba(244,67,54,0); }
      100% { box-shadow: 0 0 0 0 rgba(244,67,54,0); }
    }
    .stage-arrow { color: #BDBDBD; font-size: 20px; padding: 0 8px; flex: 0 0 auto; }

    /* ── Issue Cards ── */
    .issue-card {
      background: #FFFFFF; border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12);
      overflow: hidden; display: flex; flex-direction: column;
    }
    .issue-card .card-screenshot {
      width: 100%; height: 220px; object-fit: cover; background: #F5F5F5;
      border-bottom: 1px solid #E0E0E0;
    }
    .issue-card .card-screenshot-placeholder {
      width: 100%; height: 220px; background: #F5F5F5;
      display: flex; align-items: center; justify-content: center;
      color: #BDBDBD; font-size: 12px; border-bottom: 1px solid #E0E0E0;
    }
    .issue-card .card-body { padding: 16px; flex: 1; }
    .issue-card .card-meta { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
    .issue-card .card-title { font-weight: 600; font-size: 15px; margin-bottom: 6px; }
    .issue-card .card-impact { font-size: 13px; color: #757575; margin-bottom: 12px; }
    .issue-card .persona-dots { display: flex; gap: 4px; flex-wrap: wrap; }
    .persona-dot {
      width: 24px; height: 24px; border-radius: 50%;
      background: #E0E0E0; display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 600; cursor: help; position: relative;
    }
    .persona-dot.primary { background: #FF9800; color: #fff; }
    .issue-card .card-expand { background: none; border: none; color: #1976D2; font-size: 13px; cursor: pointer; padding: 8px 0 0; text-align: left; }
    .issue-card .card-detail { display: none; margin-top: 12px; border-top: 1px solid #F5F5F5; padding-top: 12px; }
    .issue-card .card-detail.open { display: block; }
    .issue-card .card-detail .repro { font-size: 12px; color: #757575; }
    .issue-card .card-detail .suggestion { font-size: 13px; background: #F5F5F5; padding: 10px 12px; border-radius: 4px; margin-top: 8px; }
    .cls-tag { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
    .top10-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }

    /* ── Temperature Heatmap ── */
    .heatmap-wrap { overflow-x: auto; position: relative; }
    table.heatmap { border-collapse: collapse; width: 100%; min-width: 600px; }
    table.heatmap th {
      background: #F5F5F5; font-size: 12px; font-weight: 600;
      padding: 8px 12px; text-align: center; border: 1px solid #E0E0E0;
      white-space: nowrap;
    }
    table.heatmap th.row-header { text-align: left; min-width: 140px; }
    table.heatmap td {
      border: 1px solid #E0E0E0; text-align: center;
      font-size: 13px; font-weight: 600; cursor: pointer;
      min-width: 80px; min-height: 48px; padding: 10px 8px;
      position: relative; transition: opacity 0.15s;
    }
    table.heatmap td:hover { opacity: 0.85; }
    table.heatmap td.score-0 { background: #4CAF50; color: #fff; }
    table.heatmap td.score-low { background: #FFC107; color: #212121; }
    table.heatmap td.score-mid { background: #FF9800; color: #fff; }
    table.heatmap td.score-high { background: #F44336; color: #fff; }
    /* Pattern fills for color-blind accessibility */
    table.heatmap td.score-low {
      background-image: repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.05) 4px, rgba(0,0,0,0.05) 5px);
    }
    table.heatmap td.score-mid {
      background-image: repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px);
    }
    table.heatmap td.score-high {
      background-image: repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 3px);
    }
    .heatmap-popover {
      position: fixed; z-index: 200; background: #fff; border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2); padding: 12px 16px;
      font-size: 12px; max-width: 240px; pointer-events: none; display: none;
    }
    .heatmap-popover img { width: 100%; border-radius: 4px; margin-top: 8px; }
    .heatmap-legend { display: flex; gap: 12px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
    .heatmap-legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; }
    .heatmap-legend-swatch { width: 16px; height: 16px; border-radius: 3px; }

    /* ── Recommendations ── */
    .rec-group { margin-bottom: 24px; }
    .rec-group-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    .rec-card { background: #FFFFFF; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 8px; border-left: 4px solid transparent; }
    .rec-card.quick-win { border-left-color: #4CAF50; } .rec-card.structural { border-left-color: #2196F3; } .rec-card.strategic { border-left-color: #9C27B0; }
    .rec-card .rec-title { font-weight: 600; margin-bottom: 4px; }
    .rec-card .rec-meta { font-size: 12px; color: #757575; }

    /* ── Screenshot Gallery / Lightbox ── */
    .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
    .gallery-thumb {
      border-radius: 4px; overflow: hidden; cursor: pointer;
      background: #F5F5F5; position: relative;
    }
    .gallery-thumb img { width: 100%; height: 120px; object-fit: cover; display: block; }
    .gallery-thumb .thumb-label {
      position: absolute; bottom: 0; left: 0; right: 0;
      background: rgba(0,0,0,0.6); color: #fff; font-size: 10px;
      padding: 4px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .gallery-thumb .sev-bar {
      position: absolute; top: 0; left: 0; right: 0; height: 3px;
    }
    .lightbox {
      display: none; position: fixed; inset: 0; z-index: 300;
      background: rgba(0,0,0,0.9); flex-direction: column;
    }
    .lightbox.open { display: flex; }
    .lightbox-main {
      flex: 1; display: flex; align-items: center; justify-content: center;
      padding: 24px; position: relative;
    }
    .lightbox-main img { max-height: 70vh; max-width: 90vw; border-radius: 4px; }
    .lightbox-caption {
      text-align: center; color: #E0E0E0; font-size: 13px; padding: 8px 24px;
    }
    .lightbox-nav {
      position: absolute; top: 50%; transform: translateY(-50%);
      background: rgba(255,255,255,0.15); border: none; color: #fff;
      font-size: 24px; padding: 12px 16px; cursor: pointer; border-radius: 4px;
    }
    .lightbox-prev { left: 16px; }
    .lightbox-next { right: 16px; }
    .lightbox-close {
      position: absolute; top: 16px; right: 16px;
      background: rgba(255,255,255,0.15); border: none; color: #fff;
      font-size: 20px; padding: 6px 12px; cursor: pointer; border-radius: 4px;
    }
    .filmstrip {
      display: flex; gap: 6px; padding: 12px 24px; overflow-x: auto;
      background: rgba(0,0,0,0.5);
    }
    .filmstrip-thumb {
      flex: 0 0 64px; height: 48px; border-radius: 3px; overflow: hidden;
      cursor: pointer; border: 2px solid transparent; opacity: 0.6; transition: opacity 0.15s;
    }
    .filmstrip-thumb.active { border-color: #fff; opacity: 1; }
    .filmstrip-thumb img { width: 100%; height: 100%; object-fit: cover; }

    /* ── Appendix / Filter Table ── */
    .filter-bar { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 0; margin-bottom: 16px; align-items: center; }
    .filter-tag { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; border: 1px solid #E0E0E0; cursor: pointer; background: #fff; color: #757575; transition: background 0.1s; }
    .filter-tag.active { background: #1976D2; color: #fff; border-color: #1976D2; }
    .filter-clear { margin-left: auto; font-size: 12px; color: #1976D2; cursor: pointer; background: none; border: none; }
    .filter-count { font-size: 12px; color: #757575; margin-left: 8px; }
    .appendix-table { width: 100%; border-collapse: collapse; }
    .appendix-table th { background: #F5F5F5; padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; border-bottom: 2px solid #E0E0E0; cursor: pointer; user-select: none; }
    .appendix-table th:hover { background: #EEEEEE; }
    .appendix-table td { padding: 10px 12px; border-bottom: 1px solid #F0F0F0; font-size: 13px; vertical-align: top; }
    .appendix-table tr { cursor: pointer; } .appendix-table tr:hover td { background: #FAFAFA; }
    .appendix-table .row-expand { display: none; } .appendix-table .row-expand.open { display: table-row; }
    .appendix-table .row-expand td { background: #FAFAFA; font-size: 12px; padding: 12px 16px; color: #757575; }
    .pagination { display: flex; gap: 8px; align-items: center; margin-top: 16px; flex-wrap: wrap; }
    .page-btn { padding: 6px 12px; border: 1px solid #E0E0E0; border-radius: 4px; background: #fff; cursor: pointer; font-size: 13px; }
    .page-btn.active { background: #1976D2; color: #fff; border-color: #1976D2; }

    /* ── Utility ── */
    .section-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #9E9E9E; margin-bottom: 8px; }
    .zero-state { background: #E8F5E9; border-radius: 8px; padding: 20px 24px; color: #2E7D32; text-align: center; font-weight: 500; }
    details > summary { cursor: pointer; user-select: none; }
    @media print {
      .nav, .lightbox, .filter-bar, .page-btn { display: none !important; }
      body { padding-top: 0; background: #fff; }
      .issue-card { break-inside: avoid; box-shadow: none; border: 1px solid #E0E0E0; }
      .card-detail { display: block !important; }
    }
    @media (max-width: 768px) {
      .grid-2, .grid-3, .grid-4, .top10-grid { grid-template-columns: 1fr; }
      .stats-row { gap: 16px; }
      h1 { font-size: 24px; } h2 { font-size: 20px; }
    }
    @media (max-width: 1024px) { .grid-4, .grid-3 { grid-template-columns: repeat(2, 1fr); } }
  </style>
</head>
<body>

<!-- ── Navigation ── -->
<nav class="nav">
  <div class="nav-title" id="nav-project-name">Project Name — UX Walkthrough</div>
  <div class="nav-links">
    <a href="#section-journey">Journey</a>
    <a href="#section-top10">Top Findings</a>
    <a href="#section-heatmap">Heatmap</a>
    <a href="#section-appendix">Appendix</a>
  </div>
</nav>

<!-- ── Hero Section ── -->
<section class="hero" id="section-hero">
  <div class="container">
    <div class="section-label" id="hero-date"></div>
    <h1 id="hero-title">UX Walkthrough</h1>
    <p class="subtitle" id="hero-subtitle"></p>
    <p class="narrative" id="hero-narrative"></p>
    <div class="stats-row" id="stats-row">
      <!-- Populated by JS -->
    </div>
  </div>
</section>

<!-- ── Journey Flow ── -->
<section class="section" id="section-journey">
  <div class="container">
    <div class="section-label">User Journey</div>
    <h2>Where the Experience Breaks</h2>
    <p class="secondary" style="margin: 8px 0 24px;">Stages scored by weighted issue density. Red = breakpoint, yellow = caution, green = healthy.</p>
    <div class="journey-flow" id="journey-flow">
      <!-- Populated by JS -->
    </div>
  </div>
</section>

<!-- ── Top 10 Findings ── -->
<section class="section" id="section-top10" style="background: #F5F5F5;">
  <div class="container">
    <div class="section-label">Featured Findings</div>
    <h2>Top 10 Issues</h2>
    <p class="secondary" style="margin: 8px 0 24px;">Curated by designer. Click any card for repro steps and recommendations.</p>
    <div class="top10-grid" id="top10-grid">
      <!-- Populated by JS -->
    </div>
  </div>
</section>

<!-- ── Temperature Heatmap ── -->
<section class="section" id="section-heatmap">
  <div class="container">
    <div class="section-label">Persona × Journey Stage</div>
    <h2>Experience Temperature Heatmap</h2>
    <p class="secondary" style="margin: 8px 0 16px;">Cell score = weighted issue density (P0×4 + P1×3 + P2×2 + P3×1). Hover for details, click to filter appendix.</p>
    <div class="heatmap-wrap">
      <table class="heatmap" id="heatmap-table" aria-label="Experience temperature heatmap">
        <!-- Populated by JS -->
      </table>
    </div>
    <div class="heatmap-legend">
      <div class="heatmap-legend-item"><div class="heatmap-legend-swatch" style="background:#4CAF50"></div>0 — No issues</div>
      <div class="heatmap-legend-item"><div class="heatmap-legend-swatch" style="background:#FFC107"></div>1–3 — Low</div>
      <div class="heatmap-legend-item"><div class="heatmap-legend-swatch" style="background:#FF9800"></div>4–7 — Moderate</div>
      <div class="heatmap-legend-item"><div class="heatmap-legend-swatch" style="background:#F44336"></div>8+ — Critical</div>
    </div>
  </div>
</section>

<!-- ── Recommendations ── -->
<section class="section" id="section-recs" style="background: #F5F5F5;">
  <div class="container">
    <div class="section-label">Recommendations</div>
    <h2>Prioritized Actions</h2>
    <p class="secondary" style="margin: 8px 0 24px;"></p>
    <div id="recs-container">
      <!-- Populated by JS -->
    </div>
  </div>
</section>

<!-- ── Screenshot Gallery ── -->
<section class="section" id="section-gallery">
  <div class="container">
    <div class="section-label">Evidence Gallery</div>
    <h2>Screenshots</h2>
    <p class="secondary" style="margin: 8px 0 16px;">Sorted by severity. Click to open lightbox with filmstrip navigation.</p>
    <div class="gallery-grid" id="gallery-grid">
      <!-- Populated by JS -->
    </div>
  </div>
</section>

<!-- ── Appendix ── -->
<section class="section" id="section-appendix" style="background: #F5F5F5;">
  <div class="container">
    <div class="section-label">Full Issue Database</div>
    <h2>All Findings</h2>
    <div class="filter-bar" id="filter-bar">
      <!-- Populated by JS -->
    </div>
    <div class="card" style="overflow: hidden;">
      <table class="appendix-table" id="appendix-table">
        <thead>
          <tr>
            <th data-sort="severity">Severity ↕</th>
            <th data-sort="id">ID</th>
            <th>Title</th>
            <th data-sort="classification">Class</th>
            <th>Stage</th>
            <th>Personas</th>
          </tr>
        </thead>
        <tbody id="appendix-tbody">
          <!-- Populated by JS -->
        </tbody>
      </table>
      <div class="pagination" id="pagination"></div>
    </div>
  </div>
</section>

<!-- ── Lightbox ── -->
<div class="lightbox" id="lightbox" role="dialog" aria-label="Screenshot viewer">
  <button class="lightbox-close" id="lb-close" aria-label="Close">✕</button>
  <div class="lightbox-main">
    <button class="lightbox-nav lightbox-prev" id="lb-prev" aria-label="Previous">‹</button>
    <img id="lb-img" src="" alt="">
    <button class="lightbox-nav lightbox-next" id="lb-next" aria-label="Next">›</button>
  </div>
  <div class="lightbox-caption" id="lb-caption"></div>
  <div class="filmstrip" id="filmstrip"></div>
</div>

<!-- ── Heatmap Popover ── -->
<div class="heatmap-popover" id="heatmap-popover"></div>

<!-- ── Data Injection ── -->
<script>
/* DATA — injected by /ux-present skill */
const MANIFEST = {{MANIFEST_JSON}};
const ISSUES   = {{ISSUES_JSON}};
const HEATMAP  = {{HEATMAP_JSON}};
const NARRATIVE = {{NARRATIVE_JSON}};

/* HELPERS */
const SEV_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };
const SEV_WEIGHT = { P0: 4, P1: 3, P2: 2, P3: 1 };

function sevBadge(sev) {
  const icons = { P0: '!!!', P1: '!!', P2: '!', P3: '·' };
  const cls   = { P0: 'bg-p0', P1: 'bg-p1', P2: 'bg-p2', P3: 'bg-p3' };
  const label = { P0: 'Blocker', P1: 'Severe', P2: 'Moderate', P3: 'Minor' };
  return `<span class="sev-badge ${cls[sev]}" aria-label="${sev} ${label[sev]}">
    <span class="icon" aria-hidden="true">${icons[sev]}</span> ${sev} ${label[sev]}
  </span>`;
}

function clsTag(cls) {
  const map = { 'Quick Win': 'cls-qw', 'Structural': 'cls-st', 'Strategic': 'cls-sg' };
  return `<span class="cls-tag ${map[cls] || ''}">${cls}</span>`;
}

function scoreClass(score) {
  if (score === 0) return 'score-0';
  if (score <= 3)  return 'score-low';
  if (score <= 7)  return 'score-mid';
  return 'score-high';
}

function imgOrPlaceholder(filename, cssClass) {
  if (!filename) return `<div class="card-screenshot-placeholder ${cssClass || ''}">No screenshot</div>`;
  return `<img class="card-screenshot ${cssClass || ''}" src="./screenshots/${filename}" alt="${filename}" loading="lazy"
           onerror="this.outerHTML='<div class=\'card-screenshot-placeholder\'>Screenshot unavailable<br><small>${filename}</small></div>'">`;
}

function personaDots(personas) {
  return personas.map(p => {
    const isPrimary = p.endsWith('*');
    const name = p.replace('*', '');
    const initial = name[0].toUpperCase();
    return `<span class="persona-dot${isPrimary ? ' primary' : ''}" title="${name}${isPrimary ? ' (primary)' : ''}">${initial}</span>`;
  }).join('');
}

/* INIT: HERO */
(function initHero() {
  const d = new Date(MANIFEST.walkthrough_date);
  const fmt = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('nav-project-name').textContent = MANIFEST.project + ' — UX Walkthrough';
  document.getElementById('hero-date').textContent = 'Walkthrough · ' + fmt;
  document.getElementById('hero-title').textContent = MANIFEST.project;
  document.getElementById('hero-subtitle').textContent =
    `${MANIFEST.stations} stations · ${MANIFEST.personas.length} personas · ${MANIFEST.total} findings`;
  document.getElementById('hero-narrative').textContent = NARRATIVE.lede || '';

  const stats = [
    { label: 'Total Issues', value: MANIFEST.total, color: '#FFFFFF' },
    { label: 'P0 Blockers', value: MANIFEST.by_severity.P0, color: '#F44336' },
    { label: 'P1 Severe',   value: MANIFEST.by_severity.P1, color: '#FF9800' },
    { label: 'Coverage',    value: Math.round(MANIFEST.capture_rate * 100) + '%', color: '#4CAF50' },
  ];
  document.getElementById('stats-row').innerHTML = stats.map(s =>
    `<div class="stat-block">
      <div class="stat-number" style="color:${s.color}">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>`
  ).join('');
})();

/* JOURNEY FLOW */
(function initJourney() {
  const stageScores = {};
  ISSUES.forEach(issue => {
    const stage = issue.journey_stage;
    if (!stageScores[stage]) stageScores[stage] = { score: 0, count: 0, maxSev: 'P3' };
    stageScores[stage].score += SEV_WEIGHT[issue.severity] || 0;
    stageScores[stage].count++;
    if (SEV_ORDER[issue.severity] < SEV_ORDER[stageScores[stage].maxSev]) {
      stageScores[stage].maxSev = issue.severity;
    }
  });

  const stages = [...new Set(ISSUES.map(i => i.journey_stage))];
  const flow = document.getElementById('journey-flow');
  flow.innerHTML = stages.map((stage, idx) => {
    const data = stageScores[stage] || { score: 0, count: 0, maxSev: 'P3' };
    let cls = 'healthy';
    if (data.score > 8) cls = 'breakpoint';
    else if (data.score > 3) cls = 'caution';
    const arrow = idx < stages.length - 1 ? '<span class="stage-arrow">→</span>' : '';
    return `<div class="stage-node ${cls}" title="Click to filter" onclick="filterByStage('${stage}')">
      <div class="stage-name">${stage}</div>
      <div class="stage-score">${data.score}</div>
      <div class="stage-issues">${data.count} issue${data.count !== 1 ? 's' : ''}</div>
    </div>${arrow}`;
  }).join('');
})();

/* TOP 10 */
(function initTop10() {
  const featured = ISSUES.filter(i => i.featured && !i.excluded)
    .sort((a, b) => (a.rank || 99) - (b.rank || 99));

  const grid = document.getElementById('top10-grid');
  if (featured.length === 0) {
    grid.innerHTML = '<div class="zero-state">No featured findings selected.</div>';
    return;
  }

  grid.innerHTML = featured.map(issue => `
    <div class="issue-card">
      ${imgOrPlaceholder(issue.screenshot, '')}
      <div class="card-body">
        <div class="card-meta">
          ${sevBadge(issue.severity)}
          ${clsTag(issue.classification)}
        </div>
        <div class="card-title">${issue.title}</div>
        <div class="card-impact">${issue.impact || ''}</div>
        <div class="persona-dots">${personaDots(issue.personas_affected || [])}</div>
        <button class="card-expand" onclick="toggleDetail(this)">▸ Show details &amp; repro steps</button>
        <div class="card-detail">
          <div class="repro"><strong>Repro:</strong><br>${(issue.repro_steps || []).join('<br>')}</div>
          ${issue.suggestion ? `<div class="suggestion"><strong>Suggestion:</strong> ${issue.suggestion}</div>` : ''}
          ${issue.ai_opportunity ? `<div style="margin-top:8px;font-size:12px;color:#757575"><strong>AI opportunity:</strong> ${issue.ai_opportunity}</div>` : ''}
        </div>
      </div>
    </div>
  `).join('');
})();

function toggleDetail(btn) {
  const detail = btn.nextElementSibling;
  const open = detail.classList.toggle('open');
  btn.textContent = open ? '▾ Hide details' : '▸ Show details & repro steps';
}

/* HEATMAP */
(function initHeatmap() {
  const personas   = HEATMAP.personas;
  const subStages  = HEATMAP.sub_stages;
  const cells      = HEATMAP.cells;
  const table      = document.getElementById('heatmap-table');

  let html = '<thead><tr><th class="row-header">Persona</th>';
  subStages.forEach(s => { html += `<th>${s}</th>`; });
  html += '</tr></thead><tbody>';

  personas.forEach(persona => {
    html += `<tr><th class="row-header" style="text-align:left;font-weight:500">${persona}</th>`;
    subStages.forEach(sub => {
      const key  = `${persona}:${sub}`;
      const cell = cells[key] || { score: 0, issues: [] };
      const sc   = scoreClass(cell.score);
      const aria = `${persona} at ${sub}: score ${cell.score}, ${cell.issues.length} issues`;
      html += `<td class="${sc}" data-key="${key}" aria-label="${aria}"
                 onmouseenter="showPopover(event,'${key}')"
                 onmouseleave="hidePopover()"
                 onclick="filterByCell('${persona}','${sub}')">
                 ${cell.score || ''}
               </td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';
  table.innerHTML = html;
})();

const popover = document.getElementById('heatmap-popover');
function showPopover(e, key) {
  const cell = HEATMAP.cells[key];
  if (!cell) return;
  const issues = ISSUES.filter(i => cell.issues.includes(i.id));
  const bySev = { P0: 0, P1: 0, P2: 0, P3: 0 };
  issues.forEach(i => bySev[i.severity]++);
  let html = `<strong>${issues.length} issue${issues.length !== 1 ? 's' : ''}</strong><br>`;
  if (bySev.P0) html += `P0: ${bySev.P0}  `;
  if (bySev.P1) html += `P1: ${bySev.P1}  `;
  if (bySev.P2) html += `P2: ${bySev.P2}  `;
  if (bySev.P3) html += `P3: ${bySev.P3}`;
  if (cell.screenshot) html += `<img src="./screenshots/${cell.screenshot}" alt="step screenshot" loading="lazy">`;
  popover.innerHTML = html;
  popover.style.display = 'block';
  popover.style.left = Math.min(e.clientX + 12, window.innerWidth - 260) + 'px';
  popover.style.top  = Math.min(e.clientY + 12, window.innerHeight - 200) + 'px';
}
function hidePopover() { popover.style.display = 'none'; }

/* RECOMMENDATIONS */
(function initRecs() {
  const featured = ISSUES.filter(i => i.featured && !i.excluded && i.suggestion);
  const groups = { 'Quick Win': [], 'Structural': [], 'Strategic': [] };
  featured.forEach(i => { if (groups[i.classification]) groups[i.classification].push(i); });

  const container = document.getElementById('recs-container');
  const order = ['Quick Win', 'Structural', 'Strategic'];
  const colors = { 'Quick Win': 'quick-win', 'Structural': 'structural', 'Strategic': 'strategic' };
  const labels = { 'Quick Win': '⚡ Quick Wins — Ship fast, high impact', 'Structural': '🏗 Structural — System-level redesign', 'Strategic': '🎯 Strategic — Growth opportunities' };

  container.innerHTML = order.map(cls => {
    const items = groups[cls];
    if (items.length === 0) return '';
    return `<div class="rec-group">
      <div class="rec-group-title" style="color:${{ 'Quick Win': '#2E7D32', 'Structural': '#1565C0', 'Strategic': '#6A1B9A' }[cls]}">${labels[cls]}</div>
      ${items.map(i => `
        <div class="rec-card ${colors[cls]}">
          <div class="rec-title">${i.title}</div>
          <div class="rec-meta">${sevBadge(i.severity)} · ${i.station} · ${(i.personas_affected||[]).map(p=>p.replace('*','')).join(', ')}</div>
          ${i.suggestion ? `<div style="margin-top:8px;font-size:13px">${i.suggestion}</div>` : ''}
        </div>
      `).join('')}
    </div>`;
  }).join('');
})();

/* GALLERY + LIGHTBOX */
const screenshots = ISSUES
  .filter(i => i.screenshot && !i.excluded)
  .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
  .map(i => ({ file: i.screenshot, label: i.title, sev: i.severity, caption: `${i.station} · ${i.journey_stage} · ${i.severity}` }));

let lbIndex = 0;

(function initGallery() {
  const grid = document.getElementById('gallery-grid');
  const strip = document.getElementById('filmstrip');
  const sevColors = { P0: '#F44336', P1: '#FF9800', P2: '#FFC107', P3: '#9E9E9E' };

  grid.innerHTML = screenshots.map((s, i) => `
    <div class="gallery-thumb" onclick="openLightbox(${i})">
      <div class="sev-bar" style="background:${sevColors[s.sev]}"></div>
      <img src="./screenshots/${s.file}" alt="${s.label}" loading="lazy"
           onerror="this.style.display='none';this.parentElement.style.background='#F5F5F5'">
      <div class="thumb-label">${s.label}</div>
    </div>
  `).join('');

  strip.innerHTML = screenshots.map((s, i) => `
    <div class="filmstrip-thumb" id="ft-${i}" onclick="openLightbox(${i})">
      <img src="./screenshots/${s.file}" alt="${s.label}" loading="lazy">
    </div>
  `).join('');
})();

function openLightbox(idx) {
  lbIndex = idx;
  updateLightbox();
  document.getElementById('lightbox').classList.add('open');
}
function updateLightbox() {
  const s = screenshots[lbIndex];
  document.getElementById('lb-img').src = s ? './screenshots/' + s.file : '';
  document.getElementById('lb-caption').textContent = s ? s.caption : '';
  document.querySelectorAll('.filmstrip-thumb').forEach((el, i) => {
    el.classList.toggle('active', i === lbIndex);
  });
  const active = document.getElementById('ft-' + lbIndex);
  if (active) active.scrollIntoView({ inline: 'center', behavior: 'smooth' });
}
document.getElementById('lb-close').onclick = () => document.getElementById('lightbox').classList.remove('open');
document.getElementById('lb-prev').onclick  = () => { lbIndex = (lbIndex - 1 + screenshots.length) % screenshots.length; updateLightbox(); };
document.getElementById('lb-next').onclick  = () => { lbIndex = (lbIndex + 1) % screenshots.length; updateLightbox(); };
document.getElementById('lightbox').addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft')  { lbIndex = (lbIndex - 1 + screenshots.length) % screenshots.length; updateLightbox(); }
  if (e.key === 'ArrowRight') { lbIndex = (lbIndex + 1) % screenshots.length; updateLightbox(); }
  if (e.key === 'Escape')     document.getElementById('lightbox').classList.remove('open');
});

/* APPENDIX — filter, sort, paginate */
const PAGE_SIZE = 25;
let activeFilters = { severity: [], classification: [], journey_stage: [], persona: [] };
let sortCol = 'severity', sortDir = 1;
let currentPage = 1;

(function initAppendix() {
  buildFilterBar();
  renderTable();
})();

function buildFilterBar() {
  const bar = document.getElementById('filter-bar');
  const severities = ['P0', 'P1', 'P2', 'P3'];
  const classifications = [...new Set(ISSUES.map(i => i.classification))];
  const stages = [...new Set(ISSUES.map(i => i.journey_stage))];
  const allPersonas = [...new Set(ISSUES.flatMap(i => (i.personas_affected || []).map(p => p.replace('*',''))))];

  const groups = [
    { key: 'severity', label: 'Severity', values: severities },
    { key: 'classification', label: 'Class', values: classifications },
    { key: 'journey_stage', label: 'Stage', values: stages },
    { key: 'persona', label: 'Persona', values: allPersonas },
  ];

  bar.innerHTML = groups.map(g =>
    g.values.map(v =>
      `<button class="filter-tag" data-filter="${g.key}" data-value="${v}" onclick="toggleFilter('${g.key}','${v}',this)">${v}</button>`
    ).join('')
  ).join('') + '<button class="filter-clear" onclick="clearFilters()">Clear filters</button><span class="filter-count" id="filter-count"></span>';
}

function toggleFilter(key, value, btn) {
  const arr = activeFilters[key];
  const idx = arr.indexOf(value);
  if (idx === -1) { arr.push(value); btn.classList.add('active'); }
  else            { arr.splice(idx, 1); btn.classList.remove('active'); }
  currentPage = 1;
  renderTable();
}

function clearFilters() {
  Object.keys(activeFilters).forEach(k => activeFilters[k] = []);
  document.querySelectorAll('.filter-tag').forEach(el => el.classList.remove('active'));
  currentPage = 1;
  renderTable();
}

function filterByStage(stage) {
  clearFilters();
  activeFilters.journey_stage = [stage];
  document.querySelectorAll('[data-filter="journey_stage"][data-value="' + stage + '"]')
    .forEach(el => el.classList.add('active'));
  document.getElementById('section-appendix').scrollIntoView({ behavior: 'smooth' });
  renderTable();
}

function filterByCell(persona, subStage) {
  clearFilters();
  activeFilters.persona = [persona];
  document.querySelectorAll('[data-filter="persona"][data-value="' + persona + '"]')
    .forEach(el => el.classList.add('active'));
  document.getElementById('section-appendix').scrollIntoView({ behavior: 'smooth' });
  renderTable();
}

function getFiltered() {
  return ISSUES.filter(i => {
    if (activeFilters.severity.length && !activeFilters.severity.includes(i.severity)) return false;
    if (activeFilters.classification.length && !activeFilters.classification.includes(i.classification)) return false;
    if (activeFilters.journey_stage.length && !activeFilters.journey_stage.includes(i.journey_stage)) return false;
    if (activeFilters.persona.length) {
      const personaNames = (i.personas_affected || []).map(p => p.replace('*', ''));
      if (!activeFilters.persona.some(p => personaNames.includes(p))) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortCol === 'severity') return (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) * sortDir;
    if (sortCol === 'classification') return a.classification.localeCompare(b.classification) * sortDir;
    if (sortCol === 'id') return a.id.localeCompare(b.id) * sortDir;
    return 0;
  });
}

function renderTable() {
  const filtered = getFiltered();
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.min(currentPage, pages);
  const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  document.getElementById('filter-count').textContent = `Showing ${slice.length} / ${total} issues`;

  const tbody = document.getElementById('appendix-tbody');
  tbody.innerHTML = slice.map(issue => `
    <tr onclick="toggleRow('${issue.id}')">
      <td>${sevBadge(issue.severity)}</td>
      <td><code>${issue.id}</code></td>
      <td>${issue.title}</td>
      <td>${clsTag(issue.classification)}</td>
      <td>${issue.journey_stage} · ${issue.sub_stage}</td>
      <td>${personaDots(issue.personas_affected || [])}</td>
    </tr>
    <tr class="row-expand" id="row-expand-${issue.id}">
      <td colspan="6">
        <strong>Description:</strong> ${issue.description}<br><br>
        ${issue.repro_steps ? '<strong>Repro:</strong> ' + issue.repro_steps.join(' → ') + '<br><br>' : ''}
        <strong>Impact:</strong> ${issue.impact}<br>
        ${issue.suggestion ? '<strong>Suggestion:</strong> ' + issue.suggestion : ''}
        ${issue.screenshot ? `<br><img src="./screenshots/${issue.screenshot}" style="max-width:400px;max-height:200px;margin-top:8px;border-radius:4px;display:block" loading="lazy">` : ''}
      </td>
    </tr>
  `).join('');

  renderPagination(pages);
}

function toggleRow(id) {
  const el = document.getElementById('row-expand-' + id);
  if (el) el.classList.toggle('open');
}

function renderPagination(pages) {
  const pg = document.getElementById('pagination');
  if (pages <= 1) { pg.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= pages; i++) {
    html += `<button class="page-btn${i === currentPage ? ' active' : ''}" onclick="goPage(${i})">${i}</button>`;
  }
  pg.innerHTML = html;
}

function goPage(p) { currentPage = p; renderTable(); document.getElementById('section-appendix').scrollIntoView({ behavior: 'smooth' }); }

document.querySelectorAll('.appendix-table th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.sort;
    if (sortCol === col) sortDir *= -1; else { sortCol = col; sortDir = 1; }
    renderTable();
  });
});
</script>
</body>
</html>
```

**Inject these placeholders before writing the file:**

- `{{MANIFEST_JSON}}` → `JSON.stringify(MANIFEST_DATA)`
- `{{ISSUES_JSON}}` → `JSON.stringify(ISSUES_DATA)` (all issues, with `featured`, `rank`, `excluded` fields)
- `{{HEATMAP_JSON}}` → `JSON.stringify(HEATMAP_DATA)`
- `{{NARRATIVE_JSON}}` → `JSON.stringify({ lede: "{narrative text}" })`
- `{{PROJECT_NAME}}` → the project name string

Write the completed file to `outputs/{project}/presentation.html`.

---

### Step 6: Review and Iterate

Open the file in the user's browser:

```bash
open outputs/{project}/presentation.html
```

Then ask:

> "Here's the presentation. Want to adjust anything?
>
> Common tweaks:
>   - Reorder or swap featured findings
>   - Change the narrative opening
>   - Adjust the audience tone (currently: {audience})
>   - Feature a different screenshot for a specific issue"

**Edit loop:** For each requested change:
1. If it's a data change (different featured issues, exclusions): update `ISSUES_DATA`, re-inject, rewrite file.
2. If it's a narrative change: update `NARRATIVE_JSON`, rewrite file.
3. If it's a layout/styling change: edit the `<style>` block directly.
4. Reopen in browser after each edit.

Repeat until the user says it's done. Final confirmation:

> "Presentation approved. File saved at: outputs/{project}/presentation.html
>
> To share: zip the project folder — the HTML uses relative paths and needs the screenshots/ directory alongside it.
>   zip -r {project}-presentation.zip outputs/{project}/presentation.html outputs/{project}/screenshots/"

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Zero issues at a station | Green "No issues found" card in the journey flow node |
| 50+ total issues | Appendix paginated at 25/page; Top 10 and heatmap unaffected |
| Broken screenshot path | Gray placeholder with filename, `onerror` handler in `<img>` |
| Single persona | Heatmap renders as single row; no group expand needed |
| No P0/P1 issues | Top 10 auto-filled from highest P2 issues by persona coverage |
| `manifest.json` missing | Error immediately: "Run /ux-walkthrough first to generate findings." |
| Partial stations | Warn before proceeding; incomplete stations shown in heatmap with striped cells |

---

## File Outputs

| File | Path | Description |
|------|------|-------------|
| `presentation.html` | `outputs/{project}/presentation.html` | Self-contained stakeholder presentation |

No other files are created or modified. The skill is read-only except for the final HTML output.
