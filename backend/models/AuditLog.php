<?php
namespace models;

use core\Database;

class AuditLog
{
    public static function log(
        ?string $userId,
        string  $action,
        string  $resourceType = '',
        string  $resourceId   = '',
        array   $oldValues    = [],
        array   $newValues    = []
    ): void {
        Database::execute(
            'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $userId,
                $action,
                $resourceType ?: null,
                $resourceId   ?: null,
                $oldValues ? json_encode($oldValues) : null,
                $newValues ? json_encode($newValues) : null,
                $_SERVER['REMOTE_ADDR'] ?? null,
                $_SERVER['HTTP_USER_AGENT'] ?? null,
            ]
        );
    }

    public static function list(array $filters = [], int $page = 1, int $perPage = PAGE_SIZE): array
    {
        $conditions = [];
        $params     = [];

        if (!empty($filters['user_id'])) {
            $conditions[] = 'al.user_id = ?'; $params[] = $filters['user_id'];
        }
        if (!empty($filters['action'])) {
            $conditions[] = 'al.action ILIKE ?'; $params[] = '%' . $filters['action'] . '%';
        }
        if (!empty($filters['resource_type'])) {
            $conditions[] = 'al.resource_type = ?'; $params[] = $filters['resource_type'];
        }
        if (!empty($filters['from'])) {
            $conditions[] = 'al.created_at >= ?'; $params[] = $filters['from'];
        }
        if (!empty($filters['to'])) {
            $conditions[] = 'al.created_at <= ?'; $params[] = $filters['to'];
        }

        $where  = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';
        $offset = ($page - 1) * $perPage;
        $total  = Database::queryOne(
            "SELECT COUNT(*) AS cnt FROM audit_logs al $where", $params
        )['cnt'] ?? 0;

        $listParams   = $params;
        $listParams[] = $perPage;
        $listParams[] = $offset;
        $rows = Database::query(
            "SELECT al.*,
                    u.email, u.first_name || ' ' || u.last_name AS user_name
             FROM audit_logs al
             LEFT JOIN users u ON u.id = al.user_id
             $where
             ORDER BY al.created_at DESC
             LIMIT ? OFFSET ?",
            $listParams
        );

        return ['rows' => $rows, 'total' => (int)$total];
    }
}
