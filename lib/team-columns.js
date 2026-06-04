const { supabaseAdmin } = require('./supabase');
const { getKanbanPreset } = require('./kanban-presets');

const DEFAULT_PRESET_ID = 'classic';

function slugify(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'column';
}

async function loadTeamColumns(teamId) {
  const { data, error } = await supabaseAdmin
    .from('team_columns')
    .select('id, team_id, slug, name, color_hex, sort_order')
    .eq('team_id', teamId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function seedTeamColumns(teamId, presetId = DEFAULT_PRESET_ID) {
  const existing = await loadTeamColumns(teamId);
  if (existing.length) return existing;

  const preset = getKanbanPreset(presetId);
  const rows = preset.columns.map((col, index) => ({
    team_id: teamId,
    slug: col.slug,
    name: col.name,
    color_hex: col.color_hex,
    sort_order: (index + 1) * 1000,
  }));

  const { data, error } = await supabaseAdmin.from('team_columns').insert(rows).select();
  if (error) throw error;
  return data || [];
}

async function ensureTeamColumns(teamId) {
  const cols = await loadTeamColumns(teamId);
  if (cols.length) return cols;
  return seedTeamColumns(teamId, DEFAULT_PRESET_ID);
}

async function getTeamColumnSlugs(teamId) {
  const cols = await ensureTeamColumns(teamId);
  return cols.map((c) => c.slug);
}

async function getStatusLabels(teamId) {
  const cols = await ensureTeamColumns(teamId);
  return Object.fromEntries(cols.map((c) => [c.slug, c.name]));
}

async function validateTeamStatus(teamId, status) {
  const slugs = await getTeamColumnSlugs(teamId);
  return slugs.includes(status);
}

async function uniqueSlugForTeam(teamId, baseName, excludeColumnId = null) {
  let base = slugify(baseName);
  const cols = await loadTeamColumns(teamId);
  const used = new Set(
    cols.filter((c) => c.id !== excludeColumnId).map((c) => c.slug)
  );
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

module.exports = {
  DEFAULT_PRESET_ID,
  slugify,
  loadTeamColumns,
  seedTeamColumns,
  ensureTeamColumns,
  getTeamColumnSlugs,
  getStatusLabels,
  validateTeamStatus,
  uniqueSlugForTeam,
};
