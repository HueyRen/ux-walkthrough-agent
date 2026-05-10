'use strict';

const { tool } = require('ai');
const { z } = require('zod');

function createPlaywrightTools(browser, jobId, supabaseAdmin) {
  let context = null;
  let page = null;

  async function newContext() {
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    page = await context.newPage();
  }

  async function closeContext() {
    if (context) {
      await context.close().catch(() => {});
      context = null;
      page = null;
    }
  }

  const tools = {
    navigate: tool({
      description:
        'Navigate the browser to a URL. Returns the page title and current URL after navigation.',
      parameters: z.object({
        url: z.string().describe('The URL to navigate to'),
        waitUntil: z
          .enum(['load', 'domcontentloaded', 'networkidle'])
          .default('load')
          .describe('When to consider navigation complete'),
      }),
      execute: async ({ url, waitUntil }) => {
        await page.goto(url, { waitUntil, timeout: 30000 });
        return { success: true, title: await page.title(), currentUrl: page.url() };
      },
    }),

    click: tool({
      description:
        'Click an element on the page. Provide either a CSS selector or visible text to locate the element.',
      parameters: z.object({
        selector: z.string().optional().describe('CSS selector for the element'),
        text: z.string().optional().describe('Visible text content to find and click'),
      }),
      execute: async ({ selector, text }) => {
        if (selector) {
          await page.click(selector, { timeout: 10000 });
        } else if (text) {
          await page.getByText(text, { exact: false }).first().click({ timeout: 10000 });
        } else {
          throw new Error('Provide either selector or text');
        }
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        return { clicked: true, currentUrl: page.url() };
      },
    }),

    type: tool({
      description: 'Type text into an input field identified by CSS selector.',
      parameters: z.object({
        selector: z.string().describe('CSS selector for the input field'),
        text: z.string().describe('Text to type'),
        pressEnter: z.boolean().default(false).describe('Press Enter after typing'),
      }),
      execute: async ({ selector, text, pressEnter }) => {
        await page.fill(selector, text, { timeout: 10000 });
        if (pressEnter) {
          await page.press(selector, 'Enter');
          await page.waitForLoadState('domcontentloaded').catch(() => {});
        }
        return { typed: true, currentUrl: page.url() };
      },
    }),

    screenshot: tool({
      description:
        'Take a screenshot of the current page or a specific element. The screenshot is uploaded to cloud storage.',
      parameters: z.object({
        filename: z.string().describe('Screenshot filename, e.g. r1_s1_step01_homepage.png'),
        fullPage: z.boolean().default(false).describe('Capture the full scrollable page'),
        selector: z
          .string()
          .optional()
          .describe('CSS selector to screenshot a specific element'),
      }),
      execute: async ({ filename, fullPage, selector }) => {
        let buffer;
        if (selector) {
          const el = page.locator(selector);
          buffer = await el.screenshot({ timeout: 10000 });
        } else {
          buffer = await page.screenshot({ fullPage });
        }

        const storagePath = `${jobId}/${filename}`;
        const { error } = await supabaseAdmin.storage
          .from('screenshots')
          .upload(storagePath, buffer, { contentType: 'image/png', upsert: true });

        if (error) throw new Error(`Screenshot upload failed: ${error.message}`);

        const { data: urlData } = supabaseAdmin.storage
          .from('screenshots')
          .getPublicUrl(storagePath);

        return { filename, storageUrl: urlData.publicUrl };
      },
    }),

    evaluate: tool({
      description:
        'Run JavaScript in the browser page context. Use for scrolling, extracting text, checking element states, or reading page content.',
      parameters: z.object({
        script: z.string().describe('JavaScript code to execute in the page'),
        description: z.string().describe('What this script does (for logging)'),
      }),
      execute: async ({ script }) => {
        const result = await page.evaluate(script);
        return { result };
      },
    }),

    recordIssue: tool({
      description:
        'Record a UX issue found during the walkthrough. This saves the issue to the database. Use this for every issue you discover.',
      parameters: z.object({
        id: z.string().describe('Issue ID in format P-{station}-{seq}, e.g. P-S1-01'),
        title: z.string().describe('One-line issue title'),
        station: z.string().describe('Station ID where issue was found'),
        journey_stage: z.enum(['Find', 'Select', 'Inquire']).describe('Journey phase'),
        sub_stage: z.string().describe('Sub-stage code, e.g. F1, S2, I3'),
        personas_affected: z.array(z.string()).describe('Affected persona names, * marks primary'),
        severity: z.enum(['P0', 'P1', 'P2', 'P3']).describe('Issue severity'),
        classification: z
          .enum(['Quick Win', 'Structural', 'Strategic'])
          .describe('Issue classification'),
        description: z.string().describe('First-person issue description'),
        repro_steps: z.array(z.string()).describe('Numbered reproduction steps'),
        impact: z.string().describe('Impact on user decision/behavior'),
        screenshot: z.string().describe('Screenshot filename for this issue'),
        suggestion: z.string().optional().describe('Improvement recommendation'),
        ai_opportunity: z.string().optional().describe('Whether AI could improve this'),
      }),
      execute: async (issue) => {
        const { error } = await supabaseAdmin.from('findings').insert({
          id: issue.id,
          job_id: jobId,
          station: issue.station,
          persona: issue.personas_affected.join(', '),
          severity: issue.severity,
          classification: issue.classification,
          description: issue.description,
          screenshot_url: issue.screenshot,
          raw_data: issue,
        });
        if (error) throw new Error(`recordIssue failed: ${error.message}`);

        await supabaseAdmin.rpc('increment_issue_count', { job_id: jobId });

        return { recorded: true, id: issue.id };
      },
    }),

    scroll: tool({
      description: 'Scroll the page up or down by a specified amount.',
      parameters: z.object({
        direction: z.enum(['up', 'down']).describe('Scroll direction'),
        amount: z.number().default(500).describe('Pixels to scroll'),
      }),
      execute: async ({ direction, amount }) => {
        const delta = direction === 'down' ? amount : -amount;
        await page.evaluate((d) => window.scrollBy(0, d), delta);
        await page.waitForTimeout(500);
        const scrollY = await page.evaluate(() => window.scrollY);
        return { scrolled: true, direction, scrollY };
      },
    }),
  };

  return { tools, newContext, closeContext };
}

module.exports = { createPlaywrightTools };
