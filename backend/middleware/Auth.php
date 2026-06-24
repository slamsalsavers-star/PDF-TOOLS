<?php
namespace middleware;

use core\JWT;
use core\Response;
use core\Database;

class Auth
{
    private static ?array $currentUser = null;

    // ── Require a valid JWT ───────────────────────────────────

    public static function require(array $allowedTypes = []): array
    {
        $token = self::extractToken();
        if (!$token) Response::unauthorized('No authentication token provided.');

        try {
            $payload = JWT::decode($token);
        } catch (\RuntimeException $e) {
            Response::unauthorized($e->getMessage());
        }

        $user = Database::queryOne('SELECT * FROM users WHERE id = ?', [$payload['sub']]);
        if (!$user) Response::unauthorized('User not found.');
        if ($user['status'] !== 'active') Response::unauthorized('Account is not active.');

        if (!empty($allowedTypes) && !in_array($user['user_type'], $allowedTypes, true)) {
            Response::forbidden('You do not have permission to access this resource.');
        }

        // Attach permissions for admin employees
        if (in_array($user['user_type'], ['super_admin', 'admin_employee'], true)) {
            $user['permissions'] = self::loadPermissions($user);
        }

        self::$currentUser = $user;
        return $user;
    }

    // ── Require a specific permission (admin side only) ───────

    public static function requirePermission(string $permission): void
    {
        $user = self::$currentUser;
        if (!$user) Response::unauthorized();

        if ($user['user_type'] === 'super_admin') return; // super_admin has everything

        $perms = $user['permissions'] ?? [];
        if (!in_array('*', $perms, true) && !in_array($permission, $perms, true)) {
            Response::forbidden("Missing permission: {$permission}");
        }
    }

    // ── Require corporate admin owns the resource ─────────────

    public static function requireSameCompany(string $companyId): void
    {
        $user = self::$currentUser;
        if (!$user) Response::unauthorized();

        if (in_array($user['user_type'], ['super_admin', 'admin_employee'], true)) return;

        if ($user['company_id'] !== $companyId) {
            Response::forbidden('You can only manage resources within your own company.');
        }
    }

    // ── Current authenticated user ────────────────────────────

    public static function user(): ?array
    {
        return self::$currentUser;
    }

    // ── Internals ─────────────────────────────────────────────

    private static function extractToken(): ?string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
            return trim($m[1]);
        }
        return null;
    }

    private static function loadPermissions(array $user): array
    {
        if ($user['user_type'] === 'super_admin') return ['*'];

        $rows = Database::query(
            'SELECT r.permissions FROM roles r
             JOIN user_roles ur ON ur.role_id = r.id
             WHERE ur.user_id = ?',
            [$user['id']]
        );

        $perms = [];
        foreach ($rows as $row) {
            $decoded = json_decode($row['permissions'], true) ?? [];
            $perms   = array_merge($perms, $decoded);
        }
        return array_unique($perms);
    }
}
