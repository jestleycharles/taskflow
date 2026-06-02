function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login');
}

function redirectIfAuth(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  next();
}

module.exports = { requireAuth, redirectIfAuth };
