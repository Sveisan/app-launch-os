const { Resend } = require('resend')
const config = require('../../config/app')

const resend = new Resend(config.resend.apiKey)

async function sendNotification({ subject, text, html, reply_to }) {
  await resend.emails.send({
    from: `${config.appName} <${config.fromEmail}>`,
    to: config.supportEmail,
    reply_to,
    subject,
    text,
    html,
  })
}

async function sendEmail({ to, subject, text, html, reply_to }) {
  await resend.emails.send({
    from: `${config.appName} <${config.fromEmail}>`,
    to,
    reply_to,
    subject,
    text,
    html,
  })
}

module.exports = { sendNotification, sendEmail }
