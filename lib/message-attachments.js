const crypto = require('crypto');
const path = require('path');
const { supabaseAdmin } = require('./supabase');

const CHAT_FILES_BUCKET = 'chat-files';
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_ATTACHMENT_MIME = new Set([...IMAGE_MIME, 'application/pdf']);

const ATTACHMENT_SELECT =
  'id, message_type, message_id, file_url, file_name, mime_type, file_size, uploaded_by, created_at';

function mimeToExt(mime) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
  };
  return map[mime] || '.bin';
}

function validateAttachmentFile(file) {
  if (!file) return { ok: false, status: 400, error: 'No file provided' };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, status: 400, error: 'File must be 8 MB or smaller' };
  }
  if (!ALLOWED_ATTACHMENT_MIME.has(file.mimetype)) {
    return { ok: false, status: 400, error: 'File type not allowed. Use JPEG, PNG, WebP, GIF, or PDF.' };
  }
  return { ok: true };
}

async function fetchAttachmentsForMessages(messageType, messageIds) {
  if (!messageIds?.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from('message_attachments')
    .select(ATTACHMENT_SELECT)
    .eq('message_type', messageType)
    .in('message_id', messageIds)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const map = new Map();
  for (const row of data || []) {
    const list = map.get(row.message_id) || [];
    list.push(row);
    map.set(row.message_id, list);
  }
  return map;
}

function attachAttachmentsToItems(items, attachmentsMap) {
  return (items || []).map((item) => ({
    ...item,
    attachments: attachmentsMap.get(item.id) || [],
  }));
}

async function uploadMessageAttachment({ messageType, messageId, file, userId }) {
  const validation = validateAttachmentFile(file);
  if (!validation.ok) return validation;

  const ext = path.extname(file.originalname).toLowerCase() || mimeToExt(file.mimetype);
  const safeName = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`;
  const storagePath = `${messageType}/${messageId}/${safeName}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(CHAT_FILES_BUCKET)
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });

  if (uploadErr) {
    return {
      ok: false,
      status: 500,
      error: uploadErr.message || 'Upload failed. Ensure the chat-files storage bucket exists.',
    };
  }

  const { data: urlData } = supabaseAdmin.storage.from(CHAT_FILES_BUCKET).getPublicUrl(storagePath);
  const fileName = file.originalname || safeName;

  const { data: row, error } = await supabaseAdmin
    .from('message_attachments')
    .insert({
      message_type: messageType,
      message_id: messageId,
      file_url: urlData.publicUrl,
      file_name: fileName,
      mime_type: file.mimetype,
      file_size: file.size,
      uploaded_by: userId,
    })
    .select(ATTACHMENT_SELECT)
    .single();

  if (error) {
    await supabaseAdmin.storage.from(CHAT_FILES_BUCKET).remove([storagePath]);
    return { ok: false, status: 400, error: error.message || 'Could not save attachment' };
  }

  return { ok: true, attachment: row };
}

async function getAttachmentWithAccess(attachmentId, userId) {
  const { data: att, error } = await supabaseAdmin
    .from('message_attachments')
    .select(ATTACHMENT_SELECT)
    .eq('id', attachmentId)
    .maybeSingle();

  if (error || !att) return { ok: false, status: 404, error: 'Attachment not found' };

  if (att.message_type === 'chat') {
    const { data: msg } = await supabaseAdmin
      .from('team_chat_messages')
      .select('team_id')
      .eq('id', att.message_id)
      .maybeSingle();
    if (!msg) return { ok: false, status: 404, error: 'Attachment not found' };
    const { data: member } = await supabaseAdmin
      .from('team_members')
      .select('user_id')
      .eq('team_id', msg.team_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!member) return { ok: false, status: 403, error: 'Forbidden' };
    return { ok: true, attachment: att };
  }

  if (att.message_type === 'comment') {
    const { data: msg } = await supabaseAdmin
      .from('comments')
      .select('deleted_at, task:tasks(team_id)')
      .eq('id', att.message_id)
      .maybeSingle();
    if (!msg || msg.deleted_at) return { ok: false, status: 404, error: 'Attachment not found' };
    const teamId = msg?.task?.team_id;
    if (!teamId) return { ok: false, status: 404, error: 'Attachment not found' };
    const { data: member } = await supabaseAdmin
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!member) return { ok: false, status: 403, error: 'Forbidden' };
    return { ok: true, attachment: att };
  }

  if (att.message_type === 'expense_comment') {
    const { data: msg } = await supabaseAdmin
      .from('expense_comments')
      .select('deleted_at, expense:expenses(team_id)')
      .eq('id', att.message_id)
      .maybeSingle();
    if (!msg || msg.deleted_at) return { ok: false, status: 404, error: 'Attachment not found' };
    const teamId = msg?.expense?.team_id;
    if (!teamId) return { ok: false, status: 404, error: 'Attachment not found' };
    const { data: member } = await supabaseAdmin
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!member) return { ok: false, status: 403, error: 'Forbidden' };
    return { ok: true, attachment: att };
  }

  if (att.message_type === 'dm') {
    const { data: msg } = await supabaseAdmin
      .from('dm_messages')
      .select('conversation_id')
      .eq('id', att.message_id)
      .maybeSingle();
    if (!msg) return { ok: false, status: 404, error: 'Attachment not found' };
    const { data: conv } = await supabaseAdmin
      .from('dm_conversations')
      .select('user_a_id, user_b_id')
      .eq('id', msg.conversation_id)
      .maybeSingle();
    if (!conv) return { ok: false, status: 404, error: 'Attachment not found' };
    const uid = String(userId);
    if (String(conv.user_a_id) !== uid && String(conv.user_b_id) !== uid) {
      return { ok: false, status: 403, error: 'Forbidden' };
    }
    return { ok: true, attachment: att };
  }

  return { ok: false, status: 404, error: 'Attachment not found' };
}

module.exports = {
  CHAT_FILES_BUCKET,
  MAX_ATTACHMENT_BYTES,
  ALLOWED_ATTACHMENT_MIME,
  IMAGE_MIME,
  ATTACHMENT_SELECT,
  validateAttachmentFile,
  fetchAttachmentsForMessages,
  attachAttachmentsToItems,
  uploadMessageAttachment,
  getAttachmentWithAccess,
};
