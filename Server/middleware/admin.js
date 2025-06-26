const admin = (req, res, next) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'Admin')) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
  next();
};

module.exports = admin; 