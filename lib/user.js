const GUEST_EMAIL = 'guest@taskflow.app';

const AVATAR_PRESETS = [
  { id: 'preset-1', url: '/avatars/preset-1.svg', label: 'Indigo' },
  { id: 'preset-2', url: '/avatars/preset-2.svg', label: 'Violet' },
  { id: 'preset-3', url: '/avatars/preset-3.svg', label: 'Rose' },
  { id: 'preset-4', url: '/avatars/preset-4.svg', label: 'Amber' },
  { id: 'preset-5', url: '/avatars/preset-5.svg', label: 'Emerald' },
  { id: 'preset-6', url: '/avatars/preset-6.svg', label: 'Sky' },
  { id: 'preset-7', url: '/avatars/preset-7.svg', label: 'Coral' },
  { id: 'preset-8', url: '/avatars/preset-8.svg', label: 'Slate' },
];

function isGuestUser(user) {
  return user?.email === GUEST_EMAIL || user?.is_guest === true;
}

function toSessionUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar_color: user.avatar_color,
    avatar_url: user.avatar_url || null,
    is_guest: user.email === GUEST_EMAIL,
  };
}

function isPresetAvatarUrl(url) {
  return typeof url === 'string' && url.startsWith('/avatars/preset-');
}

function isStorageAvatarUrl(url) {
  return typeof url === 'string' && url.includes('/storage/v1/object/public/avatars/');
}

function isStorageTeamAvatarUrl(url) {
  return typeof url === 'string' && url.includes('/storage/v1/object/public/avatars/teams/');
}

function randomColor() {
  const colors = ['#4f6ef7', '#7c3aed', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#64748b'];
  return colors[Math.floor(Math.random() * colors.length)];
}

module.exports = {
  GUEST_EMAIL,
  AVATAR_PRESETS,
  isGuestUser,
  toSessionUser,
  isPresetAvatarUrl,
  isStorageAvatarUrl,
  isStorageTeamAvatarUrl,
  randomColor,
};
