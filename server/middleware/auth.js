const { verifyToken } = require('../db/auth');

const checkAuth = (req, res, next) => {
    if (!req.cookies) {
        console.error('[AUTH] Cookie parser middleware not active?');
        return res.status(500).json({ error: 'Auth system unavailable (cookies missing)' });
    }
    const token = req.cookies.admin_jwt;



    
    if (!token) {
        if (req.method === 'GET' && !req.xhr && req.headers.accept && req.headers.accept.includes('text/html')) {
            return res.redirect('/mission-control-x89/login');
        }
        return res.status(404).send('Not Found');
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        res.clearCookie('admin_jwt');
        return res.redirect('/mission-control-x89/login');
    }

    req.user = decoded;
    next();
};

const ownerOnly = (req, res, next) => {
    if (req.user && req.user.role === 'owner') {
        next();
    } else {
        res.status(403).json({ success: false, error: 'Owner privileges required' });
    }
};

module.exports = { checkAuth, ownerOnly };
