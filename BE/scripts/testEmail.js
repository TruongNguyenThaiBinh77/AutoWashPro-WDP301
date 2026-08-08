require('dotenv').config({ path: __dirname + '/../.env' });
const emailService = require('../src/services/email.service');

async function testEmail() {
  try {
    console.log('Sending test email to binhtntse182370@fpt.edu.vn...');
    await emailService.sendWalkInCredentialsEmail('binhtntse182370@fpt.edu.vn', '123456');
    console.log('Email sent successfully!');
  } catch (err) {
    console.error('Error sending email:', err);
  }
}

testEmail();
