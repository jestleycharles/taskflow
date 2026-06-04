const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { sendError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { KANBAN_PRESETS } = require('../lib/kanban-presets');
const {
  ensureTeamColumns,
  loadTeamColumns,
  slugify,
  uniqueSlugForTeam,
} = require('../lib/team-columns');

const router = express.Router();
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function normalizeHexColor(value) {
  const raw = String(value || '').trim();
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  return HEX_COLOR_RE.test(withHash) ? withHash.toLowerCase() : null;
}

async function isMember(teamId, userId) {
  const { data } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single();
  return data;
}

async function assertTeamOwner(teamId, userId) {
  const m = await isMember(teamId, userId);
  return m?.role === 'owner';
}

// GET /api/kanban-presets
router.get('/api/kanban-presets', requireAuth, (req, res) => {
  res.json(
    KANBAN_PRESETS.map(({ id, name, description, columns }) => ({
      id,
      name,
      description,
      column_count: columns.length,
      columns: columns.map((c) => ({ slug: c.slug, name: c.name })),
    }))
  );
});

// GET /api/teams/:teamId/columns
router.get('/api/teams/:teamId/columns', requireAuth, async (req, res) => {
  const { teamId } = req.params;
  const userId = req.session.user.id;
  if (!await isMember(teamId, userId)) return res.status(403).json({ error: 'Not a member' });

  try {
    const columns = await ensureTeamColumns(teamId);
    res.json(columns);
  } catch (err) {
    return sendError(res, 500, err, 'load');
  }
});

// POST /api/teams/:teamId/columns — owner only
router.post('/api/teams/:teamId/columns', requireAuth, async (req, res) => {
  const { teamId } = req.params;
  const userId = req.session.user.id;
  if (!await assertTeamOwner(teamId, userId)) {
    return res.status(403).json({ error: 'Only the team owner can manage columns' });
  }

  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Column name is required' });

  const color = normalizeHexColor(req.body?.color_hex) || '#64748b';

  try {
    const cols = await loadTeamColumns(teamId);
    const maxOrder = cols.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);
    const slug = await uniqueSlugForTeam(teamId, name);

    const { data, error } = await supabaseAdmin
      .from('team_columns')
      .insert({
        team_id: teamId,
        slug,
        name,
        color_hex: color,
        sort_order: maxOrder + 1000,
      })
      .select()
      .single();

    if (error) return sendError(res, 400, error, 'save');
    res.json(data);
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }
});

// PATCH /api/teams/:teamId/columns/:columnId — owner only
router.patch('/api/teams/:teamId/columns/:columnId', requireAuth, async (req, res) => {
  const { teamId, columnId } = req.params;
  const userId = req.session.user.id;
  if (!await assertTeamOwner(teamId, userId)) {
    return res.status(403).json({ error: 'Only the team owner can manage columns' });
  }

  const { data: existing } = await supabaseAdmin
    .from('team_columns')
    .select('*')
    .eq('id', columnId)
    .eq('team_id', teamId)
    .single();

  if (!existing) return res.status(404).json({ error: 'Column not found' });

  const updates = {};
  if (req.body?.name !== undefined) {
    const trimmed = String(req.body.name).trim();
    if (!trimmed) return res.status(400).json({ error: 'Column name is required' });
    updates.name = trimmed;
  }
  if (req.body?.color_hex !== undefined) {
    const color = normalizeHexColor(req.body.color_hex);
    if (!color) return res.status(400).json({ error: 'Invalid color' });
    updates.color_hex = color;
  }

  if (!Object.keys(updates).length) return res.json(existing);

  const { data, error } = await supabaseAdmin
    .from('team_columns')
    .update(updates)
    .eq('id', columnId)
    .eq('team_id', teamId)
    .select()
    .single();

  if (error) return sendError(res, 400, error, 'save');
  res.json(data);
});

// PUT /api/teams/:teamId/columns/reorder — owner only
router.put('/api/teams/:teamId/columns/reorder', requireAuth, async (req, res) => {
  const { teamId } = req.params;
  const userId = req.session.user.id;
  const { columnIds } = req.body || {};

  if (!await assertTeamOwner(teamId, userId)) {
    return res.status(403).json({ error: 'Only the team owner can manage columns' });
  }
  if (!Array.isArray(columnIds) || !columnIds.length) {
    return res.status(400).json({ error: 'columnIds must be a non-empty array' });
  }

  const { data: existing, error } = await supabaseAdmin
    .from('team_columns')
    .select('id')
    .eq('team_id', teamId);

  if (error) return sendError(res, 500, error, 'load');

  const existingIds = new Set((existing || []).map((c) => c.id));
  if (columnIds.length !== existingIds.size || columnIds.some((id) => !existingIds.has(id))) {
    return res.status(400).json({ error: 'columnIds must include every column' });
  }

  await Promise.all(
    columnIds.map((id, index) =>
      supabaseAdmin
        .from('team_columns')
        .update({ sort_order: (index + 1) * 1000 })
        .eq('id', id)
        .eq('team_id', teamId)
    )
  );

  const columns = await loadTeamColumns(teamId);
  res.json(columns);
});

// DELETE /api/teams/:teamId/columns/:columnId — owner only
router.delete('/api/teams/:teamId/columns/:columnId', requireAuth, async (req, res) => {
  const { teamId, columnId } = req.params;
  const userId = req.session.user.id;
  const moveTasksTo = req.body?.move_tasks_to || req.query?.move_tasks_to;

  if (!await assertTeamOwner(teamId, userId)) {
    return res.status(403).json({ error: 'Only the team owner can manage columns' });
  }

  const cols = await loadTeamColumns(teamId);
  if (cols.length <= 1) {
    return res.status(400).json({ error: 'A team must have at least one column' });
  }

  const column = cols.find((c) => c.id === columnId);
  if (!column) return res.status(404).json({ error: 'Column not found' });

  const { count } = await supabaseAdmin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('status', column.slug);

  const taskCount = count || 0;
  if (taskCount > 0) {
    const targetSlug = String(moveTasksTo || '').trim();
    if (!targetSlug || targetSlug === column.slug) {
      return res.status(400).json({
        error: 'move_tasks_to is required when the column has tasks',
        task_count: taskCount,
      });
    }
    const target = cols.find((c) => c.slug === targetSlug);
    if (!target) return res.status(400).json({ error: 'Invalid move_tasks_to column' });

    await supabaseAdmin
      .from('tasks')
      .update({ status: targetSlug, updated_at: new Date().toISOString() })
      .eq('team_id', teamId)
      .eq('status', column.slug);
  }

  const { error } = await supabaseAdmin
    .from('team_columns')
    .delete()
    .eq('id', columnId)
    .eq('team_id', teamId);

  if (error) return sendError(res, 500, error, 'save');
  res.json({ success: true });
});

module.exports = router;
