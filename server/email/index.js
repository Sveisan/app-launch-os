const { Resend } = require('resend')
const config = require('../../config/app')

const resend = new Resend(config.resend.apiKey)

async function sendNotification({ subject, text }) {
  await resend.emails.send({
    from: `${config.appName} <${config.fromEmail}>`,
    to: config.supportEmail,
    subject,
    text,
  })
}

async function sendEmail({ to, subject, text }) {
  await resend.emails.send({
    from: `${config.appName} <${config.fromEmail}>`,
    to,
    subject,
    text,
  })
}

module.exports = { sendNotification, sendEmail }
