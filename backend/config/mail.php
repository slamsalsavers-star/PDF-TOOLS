<?php
// ─────────────────────────────────────────────────────────────
// SMTP Mail configuration
// Fill in your SMTP provider credentials here.
// Supports: Gmail, SendGrid, Mailgun, Brevo (Sendinblue), etc.
// ─────────────────────────────────────────────────────────────

return [
    'host'       => getenv('MAIL_HOST')       ?: 'smtp.example.com',
    'port'       => (int)(getenv('MAIL_PORT') ?: 587),   // 587 = STARTTLS, 465 = SSL
    'encryption' => getenv('MAIL_ENCRYPTION') ?: 'tls',  // 'tls' or 'ssl'
    'username'   => getenv('MAIL_USERNAME')   ?: 'your@email.com',
    'password'   => getenv('MAIL_PASSWORD')   ?: 'your_smtp_password',
    'from_email' => getenv('MAIL_FROM_EMAIL') ?: 'no-reply@pdftools.com',
    'from_name'  => getenv('MAIL_FROM_NAME')  ?: APP_NAME,
];
