/**
 * Maps database and auth errors to safe, user-facing messages.
 * Avoids leaking schema names, constraint keys, or internal details.
 */

const GENERIC = 'Something went wrong. Please try again.';
const GENERIC_SAVE = 'Could not save your changes. Please try again.';
const GENERIC_LOAD = 'Could not load data. Please try again.';

function normalizeMessage(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  return err.message || err.error_description || err.msg || '';
}

function matches(msg, patterns) {
  const lower = msg.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

function formatDbError(err, context = 'save') {
  const msg = normalizeMessage(err);
  const code = err?.code || '';

  if (code === '23505' || matches(msg, ['duplicate key', 'unique constraint', 'already exists'])) {
    if (matches(msg, ['email', 'users_email'])) {
      return 'An account with this email already exists';
    }
    if (matches(msg, ['username', 'users_username'])) {
      return 'Username already taken';
    }
    if (matches(msg, ['team_members'])) {
      return 'User already in team';
    }
    return 'This value is already in use';
  }

  if (code === '23503' || matches(msg, ['foreign key', 'violates foreign key'])) {
    return context === 'load' ? GENERIC_LOAD : 'Invalid reference — refresh and try again';
  }

  if (matches(msg, ['violates check constraint', 'invalid input syntax', 'null value'])) {
    return 'Invalid data provided';
  }

  if (matches(msg, ['permission denied', 'row-level security', 'jwt', 'pgrst'])) {
    return GENERIC;
  }

  // Supabase / PostgREST often returns raw messages — never pass them through
  if (
    msg.length > 0 &&
    (msg.includes('_') ||
      msg.includes('constraint') ||
      msg.includes('relation') ||
      msg.includes('column') ||
      msg.includes('SQL') ||
      msg.includes('postgres'))
  ) {
    return context === 'load' ? GENERIC_LOAD : context === 'save' ? GENERIC_SAVE : GENERIC;
  }

  return context === 'load' ? GENERIC_LOAD : context === 'save' ? GENERIC_SAVE : GENERIC;
}

function formatAuthError(err) {
  const msg = normalizeMessage(err);
  const code = err?.code || err?.status || '';

  if (
    code === 'user_already_exists' ||
    matches(msg, ['already registered', 'already been registered', 'user already exists'])
  ) {
    return 'An account with this email already exists';
  }

  if (
    code === 'invalid_credentials' ||
    matches(msg, ['invalid login credentials', 'invalid email or password', 'invalid credentials'])
  ) {
    return 'Invalid email or password';
  }

  if (matches(msg, ['email not confirmed', 'signup requires confirmation'])) {
    return 'Please confirm your email before signing in';
  }

  if (matches(msg, ['weak password', 'password should be at least'])) {
    return 'Password must be at least 8 characters';
  }

  if (matches(msg, ['rate limit', 'too many requests'])) {
    return 'Too many attempts. Please wait a moment and try again';
  }

  if (matches(msg, ['oauth', 'provider', 'identity'])) {
    return 'Sign-in with this provider failed. Try again or use email and password';
  }

  if (matches(msg, ['email address is already', 'account already linked'])) {
    return 'An account with this email already exists. Sign in with your original method';
  }

  return formatDbError(err, 'save');
}

function formatUploadError(err) {
  const msg = normalizeMessage(err);
  if (matches(msg, ['bucket', 'storage', 'not found'])) {
    return 'Upload failed. Please try again later';
  }
  if (matches(msg, ['payload too large', 'file size', 'entity too large'])) {
    return 'Image must be 2 MB or smaller';
  }
  return GENERIC_SAVE;
}

function sendError(res, status, err, context = 'save') {
  const message =
    context === 'auth'
      ? formatAuthError(err)
      : context === 'upload'
        ? formatUploadError(err)
        : formatDbError(err, context);
  return res.status(status).json({ error: message });
}

module.exports = {
  GENERIC,
  GENERIC_SAVE,
  GENERIC_LOAD,
  formatDbError,
  formatAuthError,
  formatUploadError,
  sendError,
};
