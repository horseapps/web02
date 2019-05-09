const _ = require('lodash');
const nodemailer = require('nodemailer');
const mailgunTransport = require('nodemailer-mailgun-transport');
const Promise = require('bluebird');
const path = require('path');
const fs = require('fs');

class Mailer {
  constructor(mailOptions = {}) {
    this.options = { auth:
      { api_key: process.env.MAILGUN_KEY, domain: process.env.MAILGUN_DOMAIN } };
    this.mailOptions = mailOptions;
  }

  getHtml(templateName, data) {
    const templateContent = fs.readFileSync(path.resolve(__dirname, templateName), 'UTF-8');
    const compiled = _.template(templateContent, { interpolate: /\{\{(.+?)\}\}/g });
    return compiled(data);
  }

  sendMail(data) {
    if (this.mailOptions.html) {
      this.mailOptions.html = this.getHtml(this.mailOptions.html, data);
    }

    return new Promise((resolve, reject) => {
      const mailer = nodemailer.createTransport(mailgunTransport(this.options));
      mailer.sendMail(this.mailOptions, (err, response) => {
        if (err) { reject(err); }

        if (process.env.NODE_ENV === 'development') {
          console.log(`Email sent with options: ${JSON.stringify(this.mailOptions)}`);
        }

        resolve(response);
      });
    });
  }
}

module.exports = Mailer;
