<?php
// Database connection — credentials come from environment variables.
// Copy backend/.env.example to backend/.env and fill in your values.
// On XAMPP, set these in Apache's httpd.conf or in backend/.env (loaded below).

$envFile = __DIR__ . '/../.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        putenv(trim($k) . '=' . trim($v));
    }
}

return [
    'host'     => getenv('DB_HOST')     ?: 'localhost',
    'port'     => getenv('DB_PORT')     ?: '5432',
    'name'     => getenv('DB_NAME')     ?: 'pdf_tools',
    'user'     => getenv('DB_USER')     ?: 'postgres',
    'password' => getenv('DB_PASSWORD') ?: '',
    'sslmode'  => getenv('DB_SSLMODE')  ?: 'prefer',
];
