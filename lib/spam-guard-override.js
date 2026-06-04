const { FEEDBACK_ADMIN_EMAIL } = require('./constants');

/** Feedback inbox admin may bypass message spam guards (cooldown / similarity). */
function canBypassSpamGuard(user) {
  return String(user?.email || '').trim().toLowerCase() === FEEDBACK_ADMIN_EMAIL;
}

module.exports = { canBypassSpamGuard };
