<?php
/**
 * One-time setup script — creates the super admin account.
 * Run from the command line: php backend/setup.php
 * Delete or move this file after use.
 */

define('ROOT_DIR', __DIR__);
require ROOT_DIR . '/config/app.php';

spl_autoload_register(function (string $class): void {
    $path = ROOT_DIR . '/' . str_replace('\\', '/', $class) . '.php';
    if (file_exists($path)) require $path;
});

// ── Run migration ─────────────────────────────────────────────────────────────
$sql = file_get_contents(ROOT_DIR . '/migrations/001_schema.sql');
if (!$sql) {
    echo "Migration file not found.\n";
    exit(1);
}

echo "Running database migration...\n";
try {
    \core\Database::getInstance()->exec($sql);
    echo "Migration completed.\n";
} catch (\PDOException $e) {
    echo "Migration error: " . $e->getMessage() . "\n";
    exit(1);
}

// ── Safety check ──────────────────────────────────────────────────────────────
$existing = \core\Database::queryOne(
    "SELECT id FROM users WHERE user_type = 'super_admin' LIMIT 1"
);
if ($existing) {
    echo "A super admin account already exists. Aborting.\n";
    exit(1);
}

// ── Collect super admin details ───────────────────────────────────────────────
echo "\n=== Super Admin Setup ===\n\n";

// Accept values as CLI args: php setup.php <email> <first> <last> <password>
if ($argc >= 5) {
    $email     = trim($argv[1]);
    $firstName = trim($argv[2]);
    $lastName  = trim($argv[3]);
    $password  = trim($argv[4]);

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo "Invalid email address.\n";
        exit(1);
    }
    if (strlen($password) < 8) {
        echo "Password must be at least 8 characters.\n";
        exit(1);
    }
} else {
    $stdin  = fopen('php://stdin', 'r');
    $prompt = function (string $q) use ($stdin): string {
        echo $q;
        $line = fgets($stdin);
        return $line === false ? '' : trim($line);
    };

    $email = '';
    while (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $email = $prompt('Email address: ');
    }

    $firstName = $prompt('First name: ');
    $lastName  = $prompt('Last name: ');

    $password = '';
    while (strlen($password) < 8) {
        $password = $prompt('Password (min 8 chars): ');
    }

    fclose($stdin);
}

// ── Create super admin ────────────────────────────────────────────────────────
$userId = \models\User::create([
    'email'         => strtolower($email),
    'password_hash' => password_hash($password, PASSWORD_BCRYPT),
    'first_name'    => $firstName,
    'last_name'     => $lastName,
    'user_type'     => 'super_admin',
    'status'        => 'active',
]);

if (!$userId) {
    echo "Failed to create super admin account.\n";
    exit(1);
}

// Mark email as verified
\models\User::verifyEmail($userId);

// Assign the super_admin role
$roleRow = \core\Database::queryOne("SELECT id FROM roles WHERE name = 'super_admin' LIMIT 1");
if ($roleRow) {
    \models\User::assignRole($userId, $roleRow['id'], $userId);
}

\models\AuditLog::log($userId, 'setup.create_super_admin', 'user', $userId);

echo "\nSuper admin account created successfully.\n";
echo "ID:    $userId\n";
echo "Email: $email\n";
echo "\nYou can now delete or move this file.\n";
