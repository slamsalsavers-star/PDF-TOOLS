<?php
namespace models;

use core\Database;

class Company
{
    public static function findById(string $id): ?array
    {
        return Database::queryOne('SELECT * FROM companies WHERE id = ?', [$id]);
    }

    public static function findBySlug(string $slug): ?array
    {
        return Database::queryOne('SELECT * FROM companies WHERE slug = ?', [$slug]);
    }

    public static function create(array $data): ?string
    {
        $slug = self::makeSlug($data['name']);
        return Database::insert(
            'INSERT INTO companies (name, slug, email, phone, address, billing_email, tax_id, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             RETURNING id',
            [
                $data['name'],
                $slug,
                $data['email'],
                $data['phone']         ?? null,
                $data['address']       ?? null,
                $data['billing_email'] ?? $data['email'],
                $data['tax_id']        ?? null,
                'active',
            ]
        );
    }

    public static function update(string $id, array $data): bool
    {
        $sets   = [];
        $params = [];
        $allowed = ['name','email','phone','address','logo_url','billing_email','tax_id','status'];

        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $sets[]   = "$field = ?";
                $params[] = $data[$field];
            }
        }
        if (empty($sets)) return false;

        $params[] = $id;
        return Database::execute(
            'UPDATE companies SET ' . implode(', ', $sets) . ' WHERE id = ?',
            $params
        ) > 0;
    }

    public static function delete(string $id): bool
    {
        return Database::execute('DELETE FROM companies WHERE id = ?', [$id]) > 0;
    }

    public static function list(array $filters = [], int $page = 1, int $perPage = PAGE_SIZE): array
    {
        $conditions = [];
        $params     = [];

        if (!empty($filters['status'])) {
            $conditions[] = 'status = ?';
            $params[]     = $filters['status'];
        }
        if (!empty($filters['search'])) {
            $conditions[] = '(name ILIKE ? OR email ILIKE ?)';
            $s = '%' . $filters['search'] . '%';
            $params[] = $s;
            $params[] = $s;
        }

        $where  = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';
        $offset = ($page - 1) * $perPage;
        $total  = Database::queryOne("SELECT COUNT(*) AS cnt FROM companies $where", $params)['cnt'] ?? 0;

        $listParams   = $params;
        $listParams[] = $perPage;
        $listParams[] = $offset;
        $rows = Database::query(
            "SELECT c.*,
                    (SELECT COUNT(*) FROM users WHERE company_id = c.id) AS employee_count
             FROM companies c $where
             ORDER BY c.created_at DESC
             LIMIT ? OFFSET ?",
            $listParams
        );

        return ['rows' => $rows, 'total' => (int)$total];
    }

    // ── Domains ───────────────────────────────────────────────

    public static function addDomain(string $companyId, string $domain): ?string
    {
        return Database::insert(
            'INSERT INTO company_domains (company_id, domain)
             VALUES (?, ?)
             ON CONFLICT (domain) DO NOTHING
             RETURNING id',
            [$companyId, strtolower(trim($domain))]
        );
    }

    public static function removeDomain(string $id, string $companyId): bool
    {
        return Database::execute(
            'DELETE FROM company_domains WHERE id = ? AND company_id = ?',
            [$id, $companyId]
        ) > 0;
    }

    public static function getDomains(string $companyId): array
    {
        return Database::query(
            'SELECT * FROM company_domains WHERE company_id = ? ORDER BY domain',
            [$companyId]
        );
    }

    public static function findByEmailDomain(string $email): ?array
    {
        $domain = substr($email, strpos($email, '@') + 1);
        return Database::queryOne(
            "SELECT c.* FROM companies c
             JOIN company_domains cd ON cd.company_id = c.id
             JOIN company_subscriptions cs ON cs.company_id = c.id
             WHERE cd.domain = ?
               AND c.status = 'active'
               AND cs.status = 'active'
               AND cs.subscription_type = 'domain'
               AND cs.current_period_end > NOW()
             LIMIT 1",
            [strtolower($domain)]
        );
    }

    // ── Invitations ───────────────────────────────────────────

    public static function createInvitation(string $companyId, string $email, string $invitedBy): ?string
    {
        $token     = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:sP', time() + INVITATION_TTL);

        return Database::insert(
            "INSERT INTO company_invitations (company_id, invited_email, invited_by, token, expires_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (company_id, invited_email) DO UPDATE
               SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, status = 'pending'
             RETURNING id",
            [$companyId, strtolower(trim($email)), $invitedBy, $token, $expiresAt]
        );
    }

    public static function getInvitationByToken(string $token): ?array
    {
        return Database::queryOne(
            "SELECT ci.*, c.name AS company_name
             FROM company_invitations ci
             JOIN companies c ON c.id = ci.company_id
             WHERE ci.token = ? AND ci.status = 'pending' AND ci.expires_at > NOW()",
            [$token]
        );
    }

    public static function acceptInvitation(string $token): bool
    {
        return Database::execute(
            "UPDATE company_invitations
             SET status = 'accepted', accepted_at = NOW()
             WHERE token = ? AND status = 'pending'",
            [$token]
        ) > 0;
    }

    public static function revokeInvitation(string $id, string $companyId): bool
    {
        return Database::execute(
            "UPDATE company_invitations SET status = 'revoked' WHERE id = ? AND company_id = ?",
            [$id, $companyId]
        ) > 0;
    }

    public static function listInvitations(string $companyId): array
    {
        return Database::query(
            "SELECT ci.*, u.first_name || ' ' || u.last_name AS invited_by_name
             FROM company_invitations ci
             JOIN users u ON u.id = ci.invited_by
             WHERE ci.company_id = ?
             ORDER BY ci.created_at DESC",
            [$companyId]
        );
    }

    // ── Helpers ───────────────────────────────────────────────

    private static function makeSlug(string $name): string
    {
        $slug = strtolower(trim(preg_replace('/[^a-zA-Z0-9]+/', '-', $name), '-'));
        $base = $slug;
        $n    = 1;
        while (self::findBySlug($slug)) {
            $slug = $base . '-' . $n++;
        }
        return $slug;
    }
}
