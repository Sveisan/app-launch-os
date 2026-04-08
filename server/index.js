const express = require('express')
const path = require('path')
const app = express()

app.use(express.json())
app.use(express.static(path.join(__dirname, '../public')))

app.use('/api/apply', require('./routes/creator'))
app.use('/api/waitlist', require('./routes/waitlist'))
app.use('/api/check-eligibility', require('./routes/eligibility'))
app.use('/api/feedback', require('./routes/feedback'))
app.use('/scout-list', require('./routes/admin'))

app.use('/breathing', require('./routes/content'))
app.get('/sitemap.xml', require('./routes/content').sitemap)
app.use('/library', require('./routes/library'))

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

if (process.env.NODE_ENV !== 'test') {
  require('./jobs/scheduler')
}
