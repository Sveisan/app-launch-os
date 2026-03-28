const nodemailer = require('nodemailer')
const config = require('../../config/app')

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: false,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
})

async function sendNotification({ subject, text }) {
  await transporter.sendMail({
    from: `"${config.appName}" <${config.smtp.user}>`,
    to: config.supportEmail,
    subject,
    text,
  })
}

module.exports = { sendNotification }
