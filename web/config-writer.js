const fs = require('fs');
const path = require('path');

function writeConfigs(projectRoot, jobId, {
  url, submitter, personas, rules,
  business_question, research_question, success_metrics,
  user_goal, in_scope, custom_persona,
}) {
  const dest = path.join(projectRoot, 'instances', jobId);
  fs.mkdirSync(dest, { recursive: true });

  // 1. system_instructions.md — use generic template
  const genericTemplate = path.join(projectRoot, 'templates', 'generic_system_instructions.md');
  fs.copyFileSync(genericTemplate, path.join(dest, 'system_instructions.md'));

  // 2. personas.md — build from user input
  const personasDoc = buildPersonasDoc(personas, custom_persona);
  fs.writeFileSync(path.join(dest, 'personas.md'), personasDoc, 'utf8');

  // 3. task_card.md — generated async by planner.js (not created here)

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
    '## User Goal',
    user_goal || '(not specified)',
    '',
    '## Research Objectives',
    `### Business Question`,
    business_question || '(not specified)',
    '',
    `### Research Question`,
    research_question || '(not specified)',
    '',
    '## Scope',
    `### In Scope`,
    in_scope || '(not specified)',
  ];
  if (custom_persona) {
    configLines.push('', '## Custom Persona', custom_persona);
  }
  const config = configLines.join('\n') + '\n';

  fs.writeFileSync(path.join(dest, 'config.md'), config, 'utf8');

  return {};
}

// Build personas doc from selected persona types and custom text
function buildPersonasDoc(selectedPersonas, customPersonaText) {
  const lines = ['# Walkthrough Personas', ''];

  const personaTemplates = {
    'new_user': {
      name: 'New User',
      label: 'First-time Visitor',
      background: 'A user visiting this website for the first time. Has no prior knowledge of the platform, its features, or terminology. Uses everyday language and expects intuitive navigation.',
      focus: 'Onboarding clarity, discoverability, cognitive load, terminology barriers',
      experience: 'Novice',
      discovery_mode: true,
    },
    'experienced_user': {
      name: 'Experienced User',
      label: 'Returning Power User',
      background: 'A frequent user who understands the platform well. Knows common workflows and terminology. Focuses on efficiency and advanced features.',
      focus: 'Task efficiency, shortcut availability, advanced feature usability, error recovery',
      experience: 'Expert',
      discovery_mode: false,
    },
    'mobile_user': {
      name: 'Mobile User',
      label: 'Mobile-first Browser',
      background: 'A user accessing the site primarily from a mobile device. Has limited screen real estate and relies on touch interactions. May be multitasking or in a distracting environment.',
      focus: 'Responsive layout, touch target sizes, content prioritization, load performance',
      experience: 'Intermediate',
      discovery_mode: false,
    },
    'accessibility_user': {
      name: 'Accessibility User',
      label: 'User with Accessibility Needs',
      background: 'A user who may rely on assistive technologies (screen readers, keyboard navigation) or has visual/motor impairments. Needs clear contrast, proper labeling, and keyboard-accessible interfaces.',
      focus: 'Color contrast, keyboard navigation, ARIA labels, text alternatives, focus indicators',
      experience: 'Intermediate',
      discovery_mode: false,
    },
  };

  // Add selected predefined personas
  let personaIndex = 1;
  for (const personaKey of selectedPersonas) {
    if (personaKey === 'custom') continue;

    const template = personaTemplates[personaKey];
    if (template) {
      lines.push(`### ${template.name}`);
      lines.push('');
      lines.push(`- **Role**: ${template.label}`);
      lines.push(`- **Background**: ${template.background}`);
      lines.push(`- **Evaluation Focus**: ${template.focus}`);
      lines.push(`- **Experience Level**: ${template.experience}`);
      lines.push(`- **Discovery Mode**: ${template.discovery_mode ? 'Yes' : 'No'}`);
      lines.push('');
      personaIndex++;
    }
  }

  // Add custom persona if provided
  if (customPersonaText && customPersonaText.trim()) {
    lines.push(`### Custom Persona`);
    lines.push('');
    lines.push(customPersonaText.trim());
    lines.push('');
  }

  // Fallback: if nothing was added, create a default "general user" persona
  if (personaIndex === 1 && (!customPersonaText || !customPersonaText.trim())) {
    lines.push(`### General User`);
    lines.push('');
    lines.push('- **Role**: Typical Website Visitor');
    lines.push('- **Background**: A general user with average technical proficiency visiting the site to accomplish a common task.');
    lines.push('- **Evaluation Focus**: Usability, clarity, task completion efficiency');
    lines.push('- **Experience Level**: Intermediate');
    lines.push('- **Discovery Mode**: No');
    lines.push('');
  }

  return lines.join('\n');
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
    // e.g. "### Lisa Chen" -> first name "lisa"
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

function getPersonaDoc(projectRoot, jobId, personaName) {
  const instanceDir = path.join(projectRoot, 'instances', jobId);
  const fullPersonas = fs.readFileSync(path.join(instanceDir, 'personas.md'), 'utf8');
  return filterPersonas(fullPersonas, [personaName]);
}

module.exports = { writeConfigs, parseStations, getPersonaDoc, filterPersonas };
