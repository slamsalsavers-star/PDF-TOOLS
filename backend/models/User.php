<?php
namespace models;

use core\Database;

class User
{
    public static function findById(string $id): ?array
    {
        return Database::queryOne('SELECT * FROM users WHERE id = ?', [$id]);
    }

    public static function findByEmail(string $email): ?array
    {
        return Database::queryOne('SELECT * FROM users WHERE email = ?', [strtolower(trim($email))]);
    }

    public static function create(array $data): ?string
    {
        return Database::insert(
            'INSERT INTO users (email, password_hash, first_name, last_name, user_type, company_id, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             RETURNING id',
            [
                strtolower(trim($data['email'])),
                $data['password_hash'],
                $data['first_name'],
                $data['last_name'],
                $data['user_type'],
                $data['company_id'] ?? null,
                $data['status'] ?? 'pending',
            ]
        );
    }

    public static function update(string $id, array $data): bool
    {
        $sets   = [];
        $params = [];

        $allowed = ['first_name','last_name','avatar_url','status','email_verified',
                    'email_verified_at','password_hash','last_login_at','company_id'];

        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $sets[]   = "$field = ?";
                $params[] = $data[$field];
            }
        }

        if (empty($sets)) return false;

        $params[] = $id;
        return Database::execute(
            'UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?',
            $params
        ) > 0;
    }

    public static function list(array $filters = [], int $page = 1, int $perPage = PAGE_SIZE): array
    {
        $conditions = [];
        $params     = [];

        if (!empty($filters['user_type'])) {
            $conditions[] = 'user_type = ?';
            $params[]     = $filters['user_type'];
        }
        if (!empty($filters['status'])) {
            $conditions[] = 'status = ?';
            $params[]     = $filters['status'];
        }
        if (!empty($filters['company_id'])) {
            $conditions[] = 'company_id = ?';
            $params[]     = $filters['company_id'];
        }
        if (!empty($filters['search'])) {
            $conditions[] = '(email ILIKE ? OR first_name ILIKE ? OR last_name ILIKE ?)';
            $s = '%' . $filters['search'] . '%';
            $params[] = $s;
            $params[] = $s;
            $params[] = $s;
        }

        $where  = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';
        $offset = ($page - 1) * $perPage;

        $total = Database::queryOne("SELECT COUNT(*) AS cnt FROM users $where", $params)['cnt'] ?? 0;

        $listParams   = $params;
        $listParams[] = $perPage;
        $listParams[] = $offset;
        $rows = Database::query(
            "SELECT id, email, first_name, last_name, user_type, company_id, status,
                    email_verified, last_login_at, created_at
             FROM users $where
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?",
            $listParams
        );

        return ['rows' => $rows, 'total' => (int)$total];
    }

    public static function delete(string $id): bool
    {
        return Database::execute('DELETE FROM users WHERE id = ?', [$id]) > 0;
    }

    public static function assignRole(string $userId, string $roleId, string $assignedBy): bool
    {
        Database::execute(
            'INSERT INTO user_roles (user_id, role_id, assigned_by)
             VALUES (?, ?, ?)
             ON CONFLICT (user_id, role_id) DO NOTHING',
            [$userId, $roleId, $assignedBy]
        );
        return true;
    }

    public static function removeRole(string $userId, string $roleId): bool
    {
        return Database::execute(
            'DELETE FROM user_roles WHERE user_id = ? AND role_id = ?',
            [$userId, $roleId]
        ) > 0;
    }

    public static function getRoles(string $userId): array
    {
        return Database::query(
            'SELECT r.* FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?',
            [$userId]
        );
    }

    public static function verifyEmail(string $userId): void
    {
        Database::execute(
            "UPDATE users SET email_verified = TRUE, email_verified_at = NOW(), status = 'active'
             WHERE id = ? AND email_verified = FALSE",
            [$userId]
        );
    }

    public static function recordLogin(string $userId): void
    {
        Database::execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$userId]);
    }

    public static function safe(array $user): array
    {
        unset($user['password_hash']);
        return $user;
    }

    public static function countByType(): array
    {
        return Database::query(
            'SELECT user_type, COUNT(*) AS count FROM users GROUP BY user_type'
        );
    }

    public static function countNewThisMonth(): int
    {
        $row = Database::queryOne(
            "SELECT COUNT(*) AS cnt FROM users WHERE created_at >= DATE_TRUNC('month', NOW())"
        );
        return (int)($row['cnt'] ?? 0);
    }
}
