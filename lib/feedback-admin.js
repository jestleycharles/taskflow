const { FEEDBACK_ADMIN_EMAIL } = require('./constants');

/** True when FEEDBACK_ADMIN_EMAIL is set and matches the user's email (case-insensitive). */
function isFeedbackAdmin(user) {
  if (!FEEDBACK_ADMIN_EMAIL) return false;
  return String(user?.email || '').trim().toLowerCase() === FEEDBACK_ADMIN_EMAIL;
}

module.exports = { isFeedbackAdmin };
