const fs = require('fs');
const path = require('path');

function writeConfigs(projectRoot, jobId, {
  url, submitter, personas, rules,
  business_question, research_question, success_metrics,
  user_goal, in_scope, custom_persona,
}) {
  const src = path.join(projectRoot, 'instances', 'alibaba-b2b');
  const dest = path.join(projectRoot, 'instances', jobId);

  fs.mkdirSync(dest, { recursive: true });

  // 1. system_instructions.md — copy verbatim
  fs.copyFileSync(
    path.join(src, 'system_instructions.md'),
    path.join(dest, 'system_instructions.md')
  );

  // 2. personas.md — filter to selected personas by first name
  const rawPersonas = fs.readFileSync(path.join(src, 'personas.md'), 'utf8');
  const filteredPersonas = filterPersonas(rawPersonas, personas);
  fs.writeFileSync(path.join(dest, 'personas.md'), filteredPersonas, 'utf8');

  // 3. task_card_01_core.md → task_card.md
  const taskCardContent = fs.readFileSync(path.join(src, 'task_card_01_core.md'), 'utf8');
  fs.writeFileSync(path.join(dest, 'task_card.md'), taskCardContent, 'utf8');

  // Parse stations for plan display
  const stations = parseStations(taskCardContent);

  // 4. config.md
  const configLines = [
    '# Walkthrough Config',
    `- Job ID: ${jobId}`,
    `- Submitter: ${submitter}`,
    `- URL: ${url}`,
    `- Personas: ${personas.join(', ')}`,
    `- Rules: ${rules}`,
    `- Date: ${new Date().toISOString()}`,
    '',
    '## 用户任务目标（最高优先级）',
    user_goal || '(未填写)',
    '',
    '## Research Objectives',
    `### Business Question`,
    business_question || '(未填写)',
    '',
    `### Research Question`,
    research_question || '(未填写)',
    '',
    '## Scope',
    `### In Scope`,
    in_scope || '(未填写)',
  ];
  if (custom_persona) {
    configLines.push('', '## Custom Persona', custom_persona);
  }
  const config = configLines.join('\n') + '\n';

  fs.writeFileSync(path.join(dest, 'config.md'), config, 'utf8');

  return { stations };
}

function filterPersonas(raw, selectedFirstNames) {
  const lines = raw.split('\n');

  // Separate header (everything before the first ### section)
  let headerEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('### ')) {
      headerEnd = i;
      break;
    }
  }
  const header = lines.slice(0, headerEnd).join('\n');

  // Split into ### sections
  const sections = [];
  let current = null;
  for (let i = headerEnd; i < lines.length; i++) {
    if (lines[i].startsWith('### ')) {
      if (current !== null) sections.push(current);
      current = [lines[i]];
    } else if (current !== null) {
      current.push(lines[i]);
    }
  }
  if (current !== null) sections.push(current);

  // Keep sections whose first name matches a selected persona
  const wanted = selectedFirstNames.map(n => n.toLowerCase());
  const kept = sections.filter(sec => {
    // e.g. "### Lisa Chen" → first name "lisa"
    const headerLine = sec[0]; // "### First Last"
    const firstName = headerLine.replace(/^###\s+/, '').split(/\s+/)[0].toLowerCase();
    return wanted.includes(firstName);
  });

  const parts = [header];
  if (kept.length > 0) {
    parts.push(kept.map(s => s.join('\n')).join('\n\n'));
  }
  return parts.join('\n') + '\n';
}

function parseStations(taskCardContent) {
  const stations = [];
  const regex = /^## 站点\s*(\d+):\s*(.+?)(?:\s*\(.*?\))?\s*$/gm;
  let match;
  while ((match = regex.exec(taskCardContent)) !== null) {
    stations.push({ id: `S${parseInt(match[1], 10)}`, name: match[2].trim() });
  }
  return stations;
}

module.exports = { writeConfigs, parseStations };
