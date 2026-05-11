'use strict';

const { tool, zodSchema } = require('ai');
const { z } = require('zod');

function createPlaywrightTools(browser, jobId, supabaseAdmin, jobEmitter, personaId) {
  let context = null;
  let page = null;
  const screenshotUrls = new Map();

  async function newContext() {
    // Randomize viewport slightly to avoid fingerprint consistency
    const w = 1440 + Math.floor(Math.random() * 80) - 40; // 1400-1480
    const h = 900 + Math.floor(Math.random() * 60) - 30;  // 870-930

    context = await browser.newContext({
      viewport: { width: w, height: h },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });

    // Comprehensive anti-detection script
    await context.addInitScript(() => {
      // 1. Hide webdriver flag
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // 2. Realistic languages matching locale
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en-US', 'en'] });

      // 3. Realistic plugins — must mimic PluginArray with Plugin objects
      const makePlugin = (name, desc, filename) => {
        const p = { name, description: desc, filename, length: 1 };
        p[0] = { type: 'application/pdf', suffixes: 'pdf', description: desc };
        return p;
      };
      const pluginArr = [
        makePlugin('PDF Viewer', 'Portable Document Format', 'internal-pdf-viewer'),
        makePlugin('Chrome PDF Viewer', 'Portable Document Format', 'internal-pdf-viewer'),
        makePlugin('Chromium PDF Viewer', 'Portable Document Format', 'internal-pdf-viewer'),
        makePlugin('Microsoft Edge PDF Viewer', 'Portable Document Format', 'internal-pdf-viewer'),
        makePlugin('WebKit built-in PDF', 'Portable Document Format', 'internal-pdf-viewer'),
      ];
      pluginArr.item = (i) => pluginArr[i];
      pluginArr.namedItem = (name) => pluginArr.find(p => p.name === name);
      pluginArr.refresh = () => {};
      Object.defineProperty(navigator, 'plugins', { get: () => pluginArr });

      // 4. Hardware signals
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
      Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });

      // 5. Chrome runtime — must exist in real Chrome
      if (!window.chrome) window.chrome = {};
      window.chrome.runtime = { id: undefined };
      window.chrome.loadTimes = () => ({});
      window.chrome.csi = () => ({});

      // 6. Permissions API — prevent detection via permission query
      const origQuery = navigator.permissions?.query?.bind(navigator.permissions);
      if (origQuery) {
        navigator.permissions.query = (params) => {
          if (params.name === 'notifications') {
            return Promise.resolve({ state: Notification.permission });
          }
          return origQuery(params);
        };
      }

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
      inputSchema: zodSchema(z.object({
        url: z.string().describe('The URL to navigate to'),
        waitUntil: z
          .enum(['load', 'domcontentloaded', 'networkidle'])
          .optional()
          .describe('When to consider navigation complete. Defaults to load'),
      })),
      execute: async ({ url, waitUntil }) => {
        await page.goto(url, { waitUntil: waitUntil || 'load', timeout: 30000 });
        return { success: true, title: await page.title(), currentUrl: page.url() };
      },
    }),

    click: tool({
      description:
        'Click an element on the page. Provide either a CSS selector or visible text to locate the element.',
      inputSchema: zodSchema(z.object({
        selector: z.string().optional().describe('CSS selector for the element'),
        text: z.string().optional().describe('Visible text content to find and click'),
      })),
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
      inputSchema: zodSchema(z.object({
        selector: z.string().describe('CSS selector for the input field'),
        text: z.string().describe('Text to type'),
        pressEnter: z.boolean().optional().describe('Press Enter after typing'),
      })),
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
      inputSchema: zodSchema(z.object({
        filename: z.string().describe('Screenshot filename, e.g. r1_s1_step01_homepage.png'),
        fullPage: z.boolean().optional().describe('Capture the full scrollable page'),
        selector: z
          .string()
          .optional()
          .describe('CSS selector to screenshot a specific element'),
      })),
      execute: async ({ filename, fullPage, selector }) => {
        let buffer;
        if (selector) {
          const el = page.locator(selector);
          buffer = await el.screenshot({ timeout: 10000 });
        } else {
          buffer = await page.screenshot({ fullPage });
        }

        const storagePath = personaId
          ? `${jobId}/${personaId}/${filename}`
          : `${jobId}/${filename}`;
        const { error } = await supabaseAdmin.storage
          .from('screenshots')
          .upload(storagePath, buffer, { contentType: 'image/png', upsert: true });

        if (error) throw new Error(`Screenshot upload failed: ${error.message}`);

        const { data: urlData } = supabaseAdmin.storage
          .from('screenshots')
          .getPublicUrl(storagePath);

        const publicUrl = urlData.publicUrl;
        screenshotUrls.set(filename, publicUrl);

        if (jobEmitter) {
          jobEmitter.emit(`job:${jobId}`, {
            type: 'screenshot', personaId, url: publicUrl, filename,
          });
        }

        return { filename, storageUrl: publicUrl };
      },
    }),

    evaluate: tool({
      description:
        'Run JavaScript in the browser page context. Use for scrolling, extracting text, checking element states, or reading page content.',
      inputSchema: zodSchema(z.object({
        script: z.string().describe('JavaScript code to execute in the page'),
        description: z.string().describe('What this script does (for logging)'),
      })),
      execute: async ({ script }) => {
        const result = await page.evaluate(script);
        return { result };
      },
    }),

    recordIssue: tool({
      description:
        'Record a UX issue found during the walkthrough. This saves the issue to the database. Use this for every issue you discover.',
      inputSchema: zodSchema(z.object({
        id: z.string().describe('Issue ID in format P-{station}-{seq}, e.g. P-S1-01'),
        title: z.string().describe('One-line issue title'),
        station: z.string().describe('Station ID where issue was found'),
        journey_stage: z.enum(['Find', 'Select', 'Inquire']).describe('Journey phase'),
        sub_stage: z.string().describe('Sub-stage code, e.g. F1, S2, I3'),
        personas_affected: z.array(z.string()).describe('Affected persona names, * marks primary'),
        severity: z.enum(['P0', 'P1', 'P2', 'P3']).describe(
          'P0=blocker (user cannot complete task), P1=severe (likely to abandon), P2=moderate (can work around), P3=minor'
        ),
        classification: z
          .enum(['Quick Win', 'Structural', 'Strategic'])
          .describe('Quick Win=low cost high benefit, Structural=system-level redesign needed, Strategic=growth opportunity'),
        description: z.string().describe('First-person issue description from the affected persona perspective, e.g. "I searched for X, but..."'),
        repro_steps: z.array(z.string()).describe('Numbered reproduction steps'),
        impact: z.string().describe('Impact on user decision/behavior'),
        screenshot: z.string().describe('Screenshot filename for this issue'),
        suggestion: z.string().optional().describe('Improvement recommendation'),
        ai_opportunity: z.string().optional().describe('Whether AI could improve this'),
      })),
      execute: async (issue) => {
        // Resolve screenshot filename to real storage URL
        const screenshotUrl = screenshotUrls.get(issue.screenshot)
          || `${supabaseAdmin.storageUrl || ''}/storage/v1/object/public/screenshots/${jobId}/${issue.screenshot}`;

        const { error } = await supabaseAdmin.from('findings').insert({
          id: issue.id,
          job_id: jobId,
          station: issue.station,
          persona: issue.personas_affected.join(', '),
          severity: issue.severity,
          classification: issue.classification,
          description: issue.description,
          screenshot_url: screenshotUrl,
          raw_data: issue,
        });
        if (error) throw new Error(`recordIssue failed: ${error.message}`);

        await supabaseAdmin.rpc('increment_issue_count', { job_id: jobId });

        if (jobEmitter) {
          jobEmitter.emit(`job:${jobId}`, {
            type: 'issue',
            personaId,
            id: issue.id,
            title: issue.title,
            severity: issue.severity,
            station: issue.station,
            persona: issue.personas_affected.join(', '),
          });
        }

        return { recorded: true, id: issue.id };
      },
    }),

    scroll: tool({
      description: 'Scroll the page up or down by a specified amount.',
      inputSchema: zodSchema(z.object({
        direction: z.enum(['up', 'down']).describe('Scroll direction'),
        amount: z.number().optional().describe('Pixels to scroll. Defaults to 500'),
      })),
      execute: async ({ direction, amount }) => {
        const delta = direction === 'down' ? (amount || 500) : -(amount || 500);
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
