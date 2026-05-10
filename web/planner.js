'use strict';

const { generateText } = require('ai');
const { getModel } = require('./models');
const { getJob, updateJob } = require('./db');
const { parseStations } = require('./config-writer');
const { jobEmitter } = require('./emitter');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildPlannerSystemPrompt() {
  return `You are a UX walkthrough planning specialist. You design evaluation station sequences for usability walkthroughs of websites.

You will receive a target URL, selected user personas, and research objectives. You must output a complete walkthrough task card in a specific markdown format.

## Output Format Rules (CRITICAL — follow exactly)

The output must be a valid markdown document with:

1. A title line: # 走查任务卡 — {site name} 走查
2. Metadata: station count, goal summary
3. An overview table (站点 | 编号 | 品类 | 主要画像 | 辅助画像)
4. Station sections, each starting with exactly this header format:
   ## 站点 N: Chinese Name (English Name)
   where N is a sequential integer starting from 1.

### Per-Station Structure

Each station section must contain:

\`\`\`
## 站点 N: 中文名 (English Name)

**目标**: One-sentence evaluation goal

### 操作步骤

1. **Action description**
   - Detail or observation point
   - 截图: \`r1_sN_category_stepNN_action.png\`

2. **Next action**
   ...

### 多画像评估维度

**Persona Name（角色标签）评估点**:
- [ ] Specific evaluation question from this persona's perspective
- [ ] Another question
...
\`\`\`

## Station Design Principles

1. Follow the Find → Select → Inquire journey framework
2. Station 1 should always be homepage/landing page evaluation
3. Middle stations cover search, browsing, product evaluation, and comparison
4. Final stations cover communication, inquiry, or conversion flows
5. Generate 5-9 stations based on scope complexity
6. Each station should have 5-10 operation steps with specific browser actions
7. Operation steps must be concrete: navigate to URL, type search term, click element, scroll, take screenshot
8. Include specific search terms or product categories relevant to the user's goal
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

  let prompt = `请为以下走查任务设计站点计划：

## 目标网站
${url}

## 选中的用户画像
${personaNames}

### 画像详细信息
${personasDoc}
`;

  if (user_goal) {
    prompt += `\n## 用户任务目标\n${user_goal}\n`;
  }

  if (business_question) {
    prompt += `\n## 业务问题\n${business_question}\n`;
  }

  if (research_question) {
    prompt += `\n## 研究问题\n${research_question}\n`;
  }

  if (in_scope) {
    prompt += `\n## 走查范围\n${in_scope}\n`;
  }

  if (custom_persona) {
    prompt += `\n## 自定义画像\n${custom_persona}\n`;
  }

  if (rules) {
    prompt += `\n## 评估规则集\n${rules}\n`;
  }

  prompt += `\n请生成 5-9 个站点的完整走查任务卡。确保覆盖用户从首次着陆到完成核心任务的完整旅程。每个站点需包含详细的操作步骤和多画像评估维度。`;

  return prompt;
}

// ---------------------------------------------------------------------------
// Plan generation
// ---------------------------------------------------------------------------

async function generatePlan(projectRoot, jobId, context) {
  try {
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

    const { text } = await generateText({
      model: getModel('claude-sonnet'),
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 8192,
    });

    // Validate output
    const stations = parseStations(text);
    if (stations.length < 3) {
      throw new Error(
        `Only ${stations.length} stations parsed from LLM output, minimum is 3`
      );
    }

    // Write task_card.md to instance directory
    fs.writeFileSync(path.join(instanceDir, 'task_card.md'), text, 'utf8');

    // Update job in DB
    const existingPlan = job.plan || {};
    await updateJob(jobId, {
      plan: {
        ...existingPlan,
        stations,
        generating: false,
        generated: true,
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
    await fallbackToTemplate(projectRoot, jobId, err.message);
  }
}

async function fallbackToTemplate(projectRoot, jobId, reason) {
  const templatePath = path.join(
    projectRoot,
    'instances',
    'alibaba-b2b',
    'task_card_01_core.md'
  );
  const template = fs.readFileSync(templatePath, 'utf8');
  const instanceDir = path.join(projectRoot, 'instances', jobId);
  fs.writeFileSync(path.join(instanceDir, 'task_card.md'), template, 'utf8');

  const stations = parseStations(template);
  const job = await getJob(jobId);
  await updateJob(jobId, {
    plan: {
      ...(job?.plan || {}),
      stations,
      generating: false,
      generated: false,
      fallback_reason: reason,
    },
  });

  console.log(
    `[planner] Fell back to template for job ${jobId}: ${reason}`
  );

  jobEmitter.emit(`job:${jobId}`, {
    type: 'plan-ready',
    stations,
    fallback: true,
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { generatePlan };
