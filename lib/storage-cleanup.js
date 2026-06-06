const { supabaseAdmin } = require('./supabase');

const FEATURE_POSTS_BUCKET = 'feature-posts';
const TASK_FILES_BUCKET = 'task-files';
const CHAT_FILES_BUCKET = 'chat-files';

function storagePathFromPublicUrl(bucket, url) {
  if (!url || typeof url !== 'string') return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

function isStorageFeaturePostUrl(url) {
  return typeof url === 'string' && url.includes(`/storage/v1/object/public/${FEATURE_POSTS_BUCKET}/`);
}

async function deleteStoragePrefix(bucket, prefix) {
  const { data: files } = await supabaseAdmin.storage.from(bucket).list(prefix);
  if (!files?.length) return;
  const paths = files.map((f) => `${prefix}/${f.name}`);
  await supabaseAdmin.storage.from(bucket).remove(paths);
}

async function deleteStoredPostImages(postId, keepUrl = null) {
  const prefix = `posts/${postId}`;
  const keepPath = keepUrl ? storagePathFromPublicUrl(FEATURE_POSTS_BUCKET, keepUrl) : null;
  const { data: files } = await supabaseAdmin.storage.from(FEATURE_POSTS_BUCKET).list(prefix);
  if (!files?.length) return;
  const paths = files
    .map((f) => `${prefix}/${f.name}`)
    .filter((p) => p !== keepPath);
  if (paths.length) await supabaseAdmin.storage.from(FEATURE_POSTS_BUCKET).remove(paths);
}

async function deleteStoredTaskFiles(taskId) {
  await deleteStoragePrefix(TASK_FILES_BUCKET, `tasks/${taskId}`);
}

async function deleteMessageAttachments(messageType, messageIds) {
  if (!messageIds?.length) return;
  const { data: attachments } = await supabaseAdmin
    .from('message_attachments')
    .select('id, file_url')
    .eq('message_type', messageType)
    .in('message_id', messageIds);

  if (!attachments?.length) return;

  const paths = attachments
    .map((a) => storagePathFromPublicUrl(CHAT_FILES_BUCKET, a.file_url))
    .filter(Boolean);
  if (paths.length) {
    await supabaseAdmin.storage.from(CHAT_FILES_BUCKET).remove(paths);
  }
  await supabaseAdmin
    .from('message_attachments')
    .delete()
    .in('id', attachments.map((a) => a.id));
}

async function deleteStoredTeamFiles(teamId, taskIds, chatMessageIds) {
  for (const taskId of taskIds) {
    await deleteStoredTaskFiles(taskId);
  }
  await deleteMessageAttachments('chat', chatMessageIds);
}

module.exports = {
  FEATURE_POSTS_BUCKET,
  TASK_FILES_BUCKET,
  CHAT_FILES_BUCKET,
  storagePathFromPublicUrl,
  isStorageFeaturePostUrl,
  deleteStoredPostImages,
  deleteStoredTaskFiles,
  deleteMessageAttachments,
  deleteStoredTeamFiles,
};
