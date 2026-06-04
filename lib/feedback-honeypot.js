/** Hidden field name sent from the feedback form (must match dashboard.html). */
const HONEYPOT_FIELD = 'tf_hp';

function isFeedbackHoneypotTriggered(body) {
  return Boolean(String(body?.[HONEYPOT_FIELD] || '').trim());
}

module.exports = { HONEYPOT_FIELD, isFeedbackHoneypotTriggered };
