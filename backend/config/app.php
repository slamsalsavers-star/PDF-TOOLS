<?php
// ─────────────────────────────────────────────────────────────
// Application configuration
// Change JWT_SECRET to a long random string in production.
// ─────────────────────────────────────────────────────────────

define('APP_NAME',    'PDF Tools');
define('APP_URL',     getenv('APP_URL') ?: 'http://localhost');
define('APP_ENV',     getenv('APP_ENV') ?: 'production');

// JWT
define('JWT_SECRET',         getenv('JWT_SECRET') ?: 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_STRING_IN_PRODUCTION');
define('JWT_ACCESS_TTL',     900);       // 15 minutes (seconds)
define('JWT_REFRESH_TTL',    604800);    // 7 days (seconds)

// Invitation token expiry
define('INVITATION_TTL',     604800);    // 7 days

// Password reset token expiry
define('PASSWORD_RESET_TTL', 3600);      // 1 hour

// Email verification token expiry
define('EMAIL_VERIFY_TTL',   86400);     // 24 hours

// Pagination default
define('PAGE_SIZE', 20);
