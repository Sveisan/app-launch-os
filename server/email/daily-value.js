const config = require('../../config/app')
const { sign } = require('../jobs/digest-token')

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function fmtDate(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d.getDate()} ${m[d.getMonth()]}`
}

function statusLink(itemId, to) {
  const token = sign(itemId, to)
  return `${config.digest.digestUrlBase}/mission-control-x89/daily-value/items/${itemId}/status?to=${to}&token=${token}`
}

function groupByPost(items) {
  const map = new Map()
  for (const it of items) {
    if (!map.has(it.monitored_post_id)) map.set(it.monitored_post_id, { post: it.post, items: [] })
    map.get(it.monitored_post_id).items.push(it)
  }
  return [...map.values()]
}

function renderHtml(groups) {
  const cards = groups.map(g => {
    const rows = g.items.map(it => `
      <div style="border-top:1px solid #eee;padding:12px 0;">
        <div style="font-size:13px;color:#666;margin-bottom:4px;">@${esc(it.commenter_handle)}</div>
        <div style="font-size:15px;color:#111;margin-bottom:8px;">${esc(it.comment_text)}</div>
        <div style="background:#f6f6f4;border-left:3px solid #52AB98;padding:8px 12px;font-size:14px;color:#333;margin-bottom:10px;">${esc(it.reply_draft)}</div>
        <div>
          <a href="${esc(it.post.post_url)}" style="display:inline-block;padding:6px 12px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:12px;margin-right:6px;">Open post</a>
          <a href="${esc(statusLink(it.id, 'replied'))}" style="display:inline-block;padding:6px 12px;background:#52AB98;color:#fff;text-decoration:none;border-radius:6px;font-size:12px;margin-right:6px;">Mark replied</a>
          <a href="${esc(statusLink(it.id, 'skipped'))}" style="display:inline-block;padding:6px 12px;background:#999;color:#fff;text-decoration:none;border-radius:6px;font-size:12px;">Skip</a>
        </div>
      </div>
    `).join('')
    const thumb = g.post.thumbnail_url
      ? `<img src="${esc(g.post.thumbnail_url)}" style="width:80px;height:80px;border-radius:8px;object-fit:cover;flex:0 0 80px;" />`
      : ''
    return `
      <div style="background:#fff;border:1px solid #eee;border-radius:12px;padding:20px;margin-bottom:20px;">
        <div style="display:flex;gap:12px;margin-bottom:12px;">
          ${thumb}
          <div>
            <div style="font-weight:600;font-size:16px;">@${esc(g.post.account_handle)}</div>
            <div style="font-size:13px;color:#666;margin-top:6px;">${esc((g.post.caption || '').slice(0, 200))}</div>
          </div>
        </div>
        ${rows}
      </div>
    `
  }).join('')
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;background:#fafaf8;padding:24px;">${cards}</div>`
}

function renderText(groups) {
  const lines = []
  for (const g of groups) {
    lines.push(`@${g.post.account_handle} — ${g.post.post_url}`)
    if (g.post.caption) lines.push(g.post.caption.slice(0, 200))
    for (const it of g.items) {
      lines.push('')
      lines.push(`  @${it.commenter_handle}: ${it.comment_text}`)
      if (it.reply_draft) lines.push(`  Draft: ${it.reply_draft}`)
      lines.push(`  Mark replied: ${statusLink(it.id, 'replied')}`)
    }
    lines.push('')
    lines.push('---')
  }
  return lines.join('\n')
}

function renderDigestEmail({ items, runSummary }) {
  if (!items || items.length === 0) return null
  const groups = groupByPost(items)
  const subject = `Daily Value — ${items.length} comment${items.length === 1 ? '' : 's'} worth showing up for (${fmtDate(new Date())})`
  return {
    subject,
    html: renderHtml(groups),
    text: renderText(groups),
  }
}

module.exports = { renderDigestEmail }
