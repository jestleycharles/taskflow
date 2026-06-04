/** Kanban column presets for new teams (slug is stored as tasks.status). */
const KANBAN_PRESETS = [
  {
    id: 'classic',
    name: 'Classic (To Do → Doing → Done)',
    description: 'Simple three-stage workflow for everyday tasks.',
    columns: [
      { slug: 'todo', name: 'To Do', color_hex: '#64748b' },
      { slug: 'doing', name: 'Doing', color_hex: '#4f6ef7' },
      { slug: 'done', name: 'Done', color_hex: '#10b981' },
    ],
  },
  {
    id: 'simple',
    name: 'Simple',
    description: 'Not started, in progress, and complete.',
    columns: [
      { slug: 'not_started', name: 'Not Started', color_hex: '#64748b' },
      { slug: 'working', name: 'Working', color_hex: '#4f6ef7' },
      { slug: 'complete', name: 'Complete', color_hex: '#10b981' },
    ],
  },
  {
    id: 'scrum',
    name: 'Scrum / Sprint',
    description: 'Backlog through sprint delivery and review.',
    columns: [
      { slug: 'backlog', name: 'Backlog', color_hex: '#64748b' },
      { slug: 'sprint', name: 'Sprint', color_hex: '#7c3aed' },
      { slug: 'in_progress', name: 'In Progress', color_hex: '#4f6ef7' },
      { slug: 'review', name: 'Review', color_hex: '#f59e0b' },
      { slug: 'done', name: 'Done', color_hex: '#10b981' },
    ],
  },
  {
    id: 'bug_tracking',
    name: 'Bug tracking',
    description: 'Triage bugs through QA to closure.',
    columns: [
      { slug: 'new', name: 'New', color_hex: '#ef4444' },
      { slug: 'triaged', name: 'Triaged', color_hex: '#f59e0b' },
      { slug: 'in_progress', name: 'In Progress', color_hex: '#4f6ef7' },
      { slug: 'qa', name: 'QA', color_hex: '#7c3aed' },
      { slug: 'closed', name: 'Closed', color_hex: '#10b981' },
    ],
  },
  {
    id: 'content',
    name: 'Content / Editorial',
    description: 'Ideas to published content pipeline.',
    columns: [
      { slug: 'ideas', name: 'Ideas', color_hex: '#64748b' },
      { slug: 'drafting', name: 'Drafting', color_hex: '#4f6ef7' },
      { slug: 'review', name: 'Review', color_hex: '#f59e0b' },
      { slug: 'published', name: 'Published', color_hex: '#10b981' },
    ],
  },
  {
    id: 'sales',
    name: 'Sales pipeline',
    description: 'Lead to won or lost deals.',
    columns: [
      { slug: 'lead', name: 'Lead', color_hex: '#64748b' },
      { slug: 'qualified', name: 'Qualified', color_hex: '#06b6d4' },
      { slug: 'proposal', name: 'Proposal', color_hex: '#4f6ef7' },
      { slug: 'negotiation', name: 'Negotiation', color_hex: '#f59e0b' },
      { slug: 'won', name: 'Won', color_hex: '#10b981' },
      { slug: 'lost', name: 'Lost', color_hex: '#ef4444' },
    ],
  },
  {
    id: 'hr',
    name: 'Hiring',
    description: 'Applicant tracking from apply to hire.',
    columns: [
      { slug: 'applied', name: 'Applied', color_hex: '#64748b' },
      { slug: 'interview', name: 'Interview', color_hex: '#4f6ef7' },
      { slug: 'offer', name: 'Offer', color_hex: '#f59e0b' },
      { slug: 'hired', name: 'Hired', color_hex: '#10b981' },
      { slug: 'rejected', name: 'Rejected', color_hex: '#ef4444' },
    ],
  },
  {
    id: 'design',
    name: 'Design',
    description: 'Creative work from brief to handoff.',
    columns: [
      { slug: 'brief', name: 'Brief', color_hex: '#64748b' },
      { slug: 'design', name: 'Design', color_hex: '#7c3aed' },
      { slug: 'feedback', name: 'Feedback', color_hex: '#f59e0b' },
      { slug: 'approved', name: 'Approved', color_hex: '#06b6d4' },
      { slug: 'handoff', name: 'Handoff', color_hex: '#10b981' },
    ],
  },
  {
    id: 'support',
    name: 'Customer support',
    description: 'Tickets from open to resolved.',
    columns: [
      { slug: 'open', name: 'Open', color_hex: '#ef4444' },
      { slug: 'waiting', name: 'Waiting on customer', color_hex: '#f59e0b' },
      { slug: 'in_progress', name: 'In Progress', color_hex: '#4f6ef7' },
      { slug: 'resolved', name: 'Resolved', color_hex: '#10b981' },
    ],
  },
  {
    id: 'marketing',
    name: 'Marketing campaigns',
    description: 'Plan, build, launch, and measure campaigns.',
    columns: [
      { slug: 'planning', name: 'Planning', color_hex: '#64748b' },
      { slug: 'production', name: 'Production', color_hex: '#4f6ef7' },
      { slug: 'scheduled', name: 'Scheduled', color_hex: '#f59e0b' },
      { slug: 'live', name: 'Live', color_hex: '#10b981' },
      { slug: 'archived', name: 'Archived', color_hex: '#94a3b8' },
    ],
  },
];

const PRESET_BY_ID = new Map(KANBAN_PRESETS.map((p) => [p.id, p]));

function getKanbanPreset(presetId) {
  return PRESET_BY_ID.get(presetId) || PRESET_BY_ID.get('classic');
}

module.exports = { KANBAN_PRESETS, getKanbanPreset };
