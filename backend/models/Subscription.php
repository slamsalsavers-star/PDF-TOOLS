<?php
namespace models;

use core\Database;

class Subscription
{
    // ── Plans ─────────────────────────────────────────────────

    public static function getPlans(string $type = 'both'): array
    {
        if ($type === 'both') {
            return Database::query(
                "SELECT * FROM subscription_plans WHERE is_active = TRUE ORDER BY sort_order"
            );
        }
        return Database::query(
            "SELECT * FROM subscription_plans WHERE is_active = TRUE AND plan_type IN (?, 'both') ORDER BY sort_order",
            [$type]
        );
    }

    public static function getPlanById(string $id): ?array
    {
        return Database::queryOne('SELECT * FROM subscription_plans WHERE id = ?', [$id]);
    }

    public static function getPlanBySlug(string $slug): ?array
    {
        return Database::queryOne('SELECT * FROM subscription_plans WHERE slug = ?', [$slug]);
    }

    // ── Company subscriptions ─────────────────────────────────

    public static function getCompanySubscription(string $companyId): ?array
    {
        return Database::queryOne(
            "SELECT cs.*, sp.name AS plan_name, sp.slug AS plan_slug, sp.features
             FROM company_subscriptions cs
             JOIN subscription_plans sp ON sp.id = cs.plan_id
             WHERE cs.company_id = ? AND cs.status IN ('active','trial','past_due')
             ORDER BY cs.created_at DESC LIMIT 1",
            [$companyId]
        );
    }

    public static function createCompanySubscription(array $data): ?string
    {
        $periodEnd = self::calcPeriodEnd($data['billing_cycle']);
        return Database::insert(
            'INSERT INTO company_subscriptions
               (company_id, plan_id, billing_cycle, subscription_type, status,
                max_seats, current_period_end, amount_per_cycle)
             VALUES (?,?,?,?,?,?,?,?)
             RETURNING id',
            [
                $data['company_id'],
                $data['plan_id'],
                $data['billing_cycle'],
                $data['subscription_type'],
                $data['status'] ?? 'active',
                $data['max_seats'] ?? null,
                $periodEnd,
                $data['amount'] ?? null,
            ]
        );
    }

    public static function updateCompanySubscription(string $id, array $data): bool
    {
        $sets   = [];
        $params = [];
        $allowed = ['plan_id','billing_cycle','subscription_type','status','max_seats',
                    'active_user_count','current_period_end','amount_per_cycle','cancelled_at'];

        foreach ($allowed as $f) {
            if (array_key_exists($f, $data)) {
                $sets[]   = "$f = ?";
                $params[] = $data[$f];
            }
        }
        if (empty($sets)) return false;

        $params[] = $id;
        return Database::execute(
            'UPDATE company_subscriptions SET ' . implode(', ', $sets) . ' WHERE id = ?',
            $params
        ) > 0;
    }

    public static function listCompanySubscriptions(array $filters = [], int $page = 1, int $perPage = PAGE_SIZE): array
    {
        $conditions = [];
        $params     = [];

        if (!empty($filters['status'])) {
            $conditions[] = 'cs.status = ?'; $params[] = $filters['status'];
        }
        if (!empty($filters['company_id'])) {
            $conditions[] = 'cs.company_id = ?'; $params[] = $filters['company_id'];
        }

        $where  = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';
        $offset = ($page - 1) * $perPage;
        $total  = Database::queryOne(
            "SELECT COUNT(*) AS cnt FROM company_subscriptions cs $where", $params
        )['cnt'] ?? 0;

        $listParams   = $params;
        $listParams[] = $perPage;
        $listParams[] = $offset;
        $rows = Database::query(
            "SELECT cs.*, sp.name AS plan_name, c.name AS company_name
             FROM company_subscriptions cs
             JOIN subscription_plans sp ON sp.id = cs.plan_id
             JOIN companies c ON c.id = cs.company_id
             $where ORDER BY cs.created_at DESC LIMIT ? OFFSET ?",
            $listParams
        );

        return ['rows' => $rows, 'total' => (int)$total];
    }

    // ── Individual subscriptions ──────────────────────────────

    public static function getIndividualSubscription(string $userId): ?array
    {
        return Database::queryOne(
            "SELECT s.*, sp.name AS plan_name, sp.slug AS plan_slug, sp.features
             FROM individual_subscriptions s
             JOIN subscription_plans sp ON sp.id = s.plan_id
             WHERE s.user_id = ? AND s.status IN ('active','trial','past_due')
             ORDER BY s.created_at DESC LIMIT 1",
            [$userId]
        );
    }

    public static function createIndividualSubscription(array $data): ?string
    {
        $periodEnd = self::calcPeriodEnd($data['billing_cycle']);
        return Database::insert(
            'INSERT INTO individual_subscriptions (user_id, plan_id, billing_cycle, status, current_period_end, amount)
             VALUES (?,?,?,?,?,?)
             RETURNING id',
            [
                $data['user_id'],
                $data['plan_id'],
                $data['billing_cycle'],
                $data['status'] ?? 'active',
                $periodEnd,
                $data['amount'] ?? null,
            ]
        );
    }

    public static function cancelIndividualSubscription(string $userId): bool
    {
        return Database::execute(
            "UPDATE individual_subscriptions
             SET status = 'cancelled', cancelled_at = NOW()
             WHERE user_id = ? AND status IN ('active','trial','past_due')",
            [$userId]
        ) > 0;
    }

    // ── Access checking ───────────────────────────────────────

    public static function checkAccess(array $user): array
    {
        if (in_array($user['user_type'], ['super_admin', 'admin_employee'], true)) {
            return ['has_access' => true, 'source' => 'admin'];
        }

        if ($user['user_type'] === 'individual') {
            $sub = self::getIndividualSubscription($user['id']);
            if ($sub && in_array($sub['status'], ['active', 'trial'])) {
                return ['has_access' => true, 'source' => 'individual', 'plan' => $sub['plan_name']];
            }
            return ['has_access' => false, 'source' => 'free'];
        }

        if ($user['company_id']) {
            $sub = self::getCompanySubscription($user['company_id']);
            if ($sub && in_array($sub['status'], ['active', 'trial'])) {
                return ['has_access' => true, 'source' => 'corporate', 'plan' => $sub['plan_name']];
            }
        }

        return ['has_access' => false, 'source' => 'free'];
    }

    // ── Revenue reporting ─────────────────────────────────────

    public static function getMRR(): float
    {
        $row = Database::queryOne(
            "SELECT
               COALESCE(SUM(CASE WHEN billing_cycle='monthly' THEN amount_per_cycle
                                 WHEN billing_cycle='yearly'  THEN amount_per_cycle/12 END), 0) AS mrr
             FROM company_subscriptions WHERE status = 'active'"
        );
        $companyMRR = (float)($row['mrr'] ?? 0);

        $row2 = Database::queryOne(
            "SELECT
               COALESCE(SUM(CASE WHEN billing_cycle='monthly' THEN amount
                                 WHEN billing_cycle='yearly'  THEN amount/12 END), 0) AS mrr
             FROM individual_subscriptions WHERE status = 'active'"
        );
        return $companyMRR + (float)($row2['mrr'] ?? 0);
    }

    public static function getRevenueByMonth(int $months = 12): array
    {
        return Database::query(
            "SELECT
               DATE_TRUNC('month', created_at) AS month,
               subscription_type,
               SUM(amount) AS total
             FROM invoices
             WHERE status = 'paid'
               AND created_at >= NOW() - INTERVAL '" . (int)$months . " months'
             GROUP BY 1, 2
             ORDER BY 1"
        );
    }

    public static function getActiveCount(): array
    {
        $co = Database::queryOne(
            "SELECT COUNT(*) AS cnt FROM company_subscriptions WHERE status = 'active'"
        )['cnt'] ?? 0;
        $ind = Database::queryOne(
            "SELECT COUNT(*) AS cnt FROM individual_subscriptions WHERE status = 'active'"
        )['cnt'] ?? 0;
        return ['corporate' => (int)$co, 'individual' => (int)$ind];
    }

    // ── Helpers ───────────────────────────────────────────────

    private static function calcPeriodEnd(string $cycle): string
    {
        $ts = ($cycle === 'yearly') ? strtotime('+1 year') : strtotime('+1 month');
        return date('Y-m-d H:i:sP', $ts);
    }
}
