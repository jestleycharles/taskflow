const { isFeedbackAdmin } = require('./feedback-admin');

/** Feedback inbox admin may bypass message spam guards (cooldown / similarity). */
function canBypassSpamGuard(user) {
  return isFeedbackAdmin(user);
}

module.exports = { canBypassSpamGuard };
