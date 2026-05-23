const express = require('express')
const router = express.Router()
const { checkAuth } = require('../middleware/auth')
const { renderDashboard } = require('../templates/dashboard')

router.get('/', checkAuth, (req, res) => {
  res.send(renderDashboard({
    userEmail: req.user.email,
    userRole: req.user.role,
  }))
})

module.exports = router
