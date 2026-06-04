const MIN_PASSWORD_LENGTH = 8;
const FEEDBACK_ADMIN_EMAIL = String(process.env.FEEDBACK_ADMIN_EMAIL || '')
  .trim()
  .toLowerCase();

module.exports = { MIN_PASSWORD_LENGTH, FEEDBACK_ADMIN_EMAIL };
