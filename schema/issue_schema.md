# Issue Schema (Canonical Definition)

This is the single source of truth for the issue data model. All templates, instances, and executor agents reference this schema.

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Format: `P-{station}-{seq}`, e.g. `P-S1-01` |
| `title` | string | Yes | One-line issue title |
| `station` | string | Yes | Station where issue was discovered |
| `journey_stage` | enum | Yes | The journey phase (e.g., Find / Select / Inquire) |
| `sub_stage` | string | Yes | Sub-stage code (e.g., F1, S2, I3) |
| `personas_affected` | string[] | Yes | Persona names, `*` marks primary |
| `severity` | enum | Yes | P0 (blocker, weight 4) / P1 (severe, 3) / P2 (moderate, 2) / P3 (minor, 1) |
| `classification` | enum | Yes | Quick Win / Structural / Strategic |
| `description` | string | Yes | First-person description ("I searched for X, but...") |
| `repro_steps` | string[] | Yes | Numbered reproduction steps |
| `impact` | string | Yes | Specific impact on user decision/behavior |
| `screenshot` | string | Yes | Issue screenshot filename |
| `suggestion` | string | No | Improvement recommendation |
| `ai_opportunity` | string | No | Whether AI could improve this (yes/no + brief) |

## Severity Weights

| Level | Name | Weight | Definition |
|-------|------|--------|------------|
| P0 | Blocker | 4 | User cannot complete current task, flow is broken |
| P1 | Severe | 3 | User experience severely impaired, likely to abandon |
| P2 | Moderate | 2 | Noticeable flaw, some users struggle but can work around |
| P3 | Minor | 1 | Small issue, minimal impact on main flow |

## Classification

| Type | Definition |
|------|------------|
| Quick Win | Low cost, high benefit, can ship fast |
| Structural | Requires system-level redesign (information architecture, interaction patterns) |
| Strategic | Not a defect but a growth opportunity the platform should pursue |

## JSON Format (for structured findings)

```json
{
  "id": "P-S1-01",
  "title": "Navigation categories overflow on mobile",
  "station": "S1 Homepage",
  "journey_stage": "Find",
  "sub_stage": "F1",
  "personas_affected": ["Lisa*", "Carlos"],
  "severity": "P2",
  "classification": "Structural",
  "description": "I landed on the homepage and tried to browse categories, but the navigation bar overflows horizontally and I can't see all options without scrolling.",
  "repro_steps": [
    "1. Navigate to alibaba.com",
    "2. Look at the top navigation category bar",
    "3. Try to view all category options"
  ],
  "impact": "New users cannot discover all product categories, limiting their initial exploration and potentially causing them to miss relevant products.",
  "screenshot": "r1_s1_issue_01_nav_overflow.jpg",
  "suggestion": "Use a responsive mega-menu or collapsible category grid that adapts to viewport width.",
  "ai_opportunity": "Yes -- AI could personalize the visible categories based on the user's industry/role detected from signup data."
}
```

## Markdown Format (for human-readable findings)

```markdown
### P-S1-01 Navigation categories overflow on mobile

| Field | Content |
|-------|---------|
| **Station** | S1 Homepage |
| **Journey Stage** | Find |
| **Sub-stage** | F1 |
| **Personas Affected** | Lisa*, Carlos |
| **Severity** | P2 (Moderate) |
| **Classification** | Structural |
| **Description** | I landed on the homepage and tried to browse categories, but the navigation bar overflows horizontally... |
| **Repro Steps** | 1. Navigate to alibaba.com 2. Look at top nav... |
| **Impact** | New users cannot discover all product categories... |
| **Screenshot** | r1_s1_issue_01_nav_overflow.jpg |
| **Suggestion** | Use a responsive mega-menu... |
| **AI Opportunity** | Yes -- AI could personalize visible categories... |
```

## audit_checker Validation Rules

Each issue must pass these checks after recording:

1. `id` matches pattern `P-S{N}-{NN}`
2. `severity` is one of: P0, P1, P2, P3
3. `classification` is one of: Quick Win, Structural, Strategic
4. `screenshot` file exists in `./screenshots/` directory
5. `impact` field references the persona's business goal or cognitive model
6. `suggestion` is present OR explicitly marked `"no suggestion"`
7. `repro_steps` has at least 2 steps

Failed checks trigger auto-remediation (text phase) or [INCOMPLETE] marking.
