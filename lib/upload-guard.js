const UPLOAD_WINDOW_MS = 60 * 60 * 1000;
const HOURLY_UPLOAD_LIMIT = 30;

/**
 * Per-user hourly cap on chat/DM file uploads (message_attachments rows).
 */
async function assertCanUploadFile(client, userId) {
  try {
    const since = new Date(Date.now() - UPLOAD_WINDOW_MS).toISOString();
    const { data, count, error } = await client
      .from('message_attachments')
      .select('created_at', { count: 'exact' })
      .eq('uploaded_by', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      return { ok: false, status: 500, error: 'Could not upload file. Please try again.' };
    }

    const uploadCount = count ?? 0;
    if (uploadCount >= HOURLY_UPLOAD_LIMIT) {
      let retryAfterMs = UPLOAD_WINDOW_MS;
      const oldest = data?.[0]?.created_at;
      if (oldest) {
        const oldestMs = new Date(oldest).getTime();
        if (!Number.isNaN(oldestMs)) {
          retryAfterMs = Math.max(1000, oldestMs + UPLOAD_WINDOW_MS - Date.now());
        }
      }
      const waitMin = Math.max(1, Math.ceil(retryAfterMs / 60000));
      return {
        ok: false,
        status: 429,
        error: `Upload limit reached (${HOURLY_UPLOAD_LIMIT} files per hour). Try again in about ${waitMin} minute${waitMin === 1 ? '' : 's'}.`,
        retry_after_ms: retryAfterMs,
      };
    }

    return { ok: true };
  } catch (err) {
    console.error('[upload-guard]', err);
    return { ok: false, status: 500, error: 'Could not upload file. Please try again.' };
  }
}

module.exports = {
  assertCanUploadFile,
  HOURLY_UPLOAD_LIMIT,
  UPLOAD_WINDOW_MS,
};
