<?php
namespace controllers;

use core\Database;
use core\Response;
use middleware\Auth;
use models\AuditLog;
use models\Company;
use models\Subscription;
use models\User;

class AdminController
{
    private function requireAdmin(string $permission = ''): array
    {
        $user = Auth::require(['super_admin', 'admin_employee']);
        if ($permission) Auth::requirePermission($permission);
        return $user;
    }

    // ── Dashboard ─────────────────────────────────────────────

    // GET /admin/dashboard
    public function dashboard(array $params): void
    {
        $this->requireAdmin();

        $userCounts = User::countByType();
        $subCounts  = Subscription::getActiveCount();
        $mrr        = Subscription::getMRR();
        $newUsers   = User::countNewThisMonth();

        $byType = [];
        foreach ($userCounts as $row) $byType[$row['user_type']] = (int)$row['count'];

        Response::success([
            'users'    => ['by_type' => $byType, 'new_this_month' => $newUsers],
            'subscriptions' => $subCounts,
            'mrr'      => round($mrr, 2),
        ]);
    }

    // ── Users ─────────────────────────────────────────────────

    // GET /admin/users
    public function listUsers(array $params): void
    {
        $this->requireAdmin('users.view');
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $filters = array_intersect_key($_GET, array_flip(['user_type','status','search','company_id']));
        ['rows' => $rows, 'total' => $total] = User::list($filters, $page);
        Response::paginated($rows, $total, $page, PAGE_SIZE);
    }

    // GET /admin/users/:id
    public function getUser(array $params): void
    {
        $this->requireAdmin('users.view');
        $user = User::findById($params['id'] ?? '');
        if (!$user) Response::notFound('User not found.');
        $user['roles'] = User::getRoles($user['id']);
        Response::success(User::safe($user));
    }

    // POST /admin/users
    public function createUser(array $params): void
    {
        $admin = $this->requireAdmin('users.create');
        $body  = $this->json();
        $this->validate($body, ['email','password','first_name','last_name','user_type']);

        if (User::findByEmail($body['email'])) {
            Response::error('A user with this email already exists.', 409);
        }

        $userId = User::create([
            'email'         => $body['email'],
            'password_hash' => password_hash($body['password'], PASSWORD_BCRYPT),
            'first_name'    => $body['first_name'],
            'last_name'     => $body['last_name'],
            'user_type'     => $body['user_type'],
            'company_id'    => $body['company_id'] ?? null,
            'status'        => 'active',
        ]);

        // Force email verified for admin-created users
        User::verifyEmail($userId);

        if (!empty($body['role_id'])) {
            User::assignRole($userId, $body['role_id'], $admin['id']);
        }

        AuditLog::log($admin['id'], 'admin.create_user', 'user', $userId, [], ['email' => $body['email']]);
        Response::created(['id' => $userId], 'User created successfully.');
    }

    // PUT /admin/users/:id
    public function updateUser(array $params): void
    {
        $admin = $this->requireAdmin('users.edit');
        $user  = User::findById($params['id'] ?? '');
        if (!$user) Response::notFound('User not found.');

        $body    = $this->json();
        $allowed = ['first_name','last_name','status','company_id','user_type'];
        $update  = array_intersect_key($body, array_flip($allowed));

        $old = array_intersect_key($user, $update);
        User::update($user['id'], $update);
        AuditLog::log($admin['id'], 'admin.update_user', 'user', $user['id'], $old, $update);

        Response::success(null, 'User updated.');
    }

    // DELETE /admin/users/:id
    public function deleteUser(array $params): void
    {
        $admin = $this->requireAdmin('users.delete');
        $user  = User::findById($params['id'] ?? '');
        if (!$user) Response::notFound('User not found.');
        if ($user['user_type'] === 'super_admin') Response::forbidden('Cannot delete a super admin.');

        User::delete($user['id']);
        AuditLog::log($admin['id'], 'admin.delete_user', 'user', $user['id'], ['email' => $user['email']], []);

        Response::success(null, 'User deleted.');
    }

    // POST /admin/users/:id/roles
    public function assignRole(array $params): void
    {
        $admin = $this->requireAdmin('users.edit');
        $body  = $this->json();
        $this->validate($body, ['role_id']);

        User::assignRole($params['id'], $body['role_id'], $admin['id']);
        AuditLog::log($admin['id'], 'admin.assign_role', 'user', $params['id'], [], ['role_id' => $body['role_id']]);
        Response::success(null, 'Role assigned.');
    }

    // DELETE /admin/users/:id/roles/:role_id
    public function removeRole(array $params): void
    {
        $admin = $this->requireAdmin('users.edit');
        User::removeRole($params['id'], $params['role_id']);
        AuditLog::log($admin['id'], 'admin.remove_role', 'user', $params['id']);
        Response::success(null, 'Role removed.');
    }

    // ── Companies ─────────────────────────────────────────────

    // GET /admin/companies
    public function listCompanies(array $params): void
    {
        $this->requireAdmin('companies.view');
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $filters = array_intersect_key($_GET, array_flip(['status','search']));
        ['rows' => $rows, 'total' => $total] = Company::list($filters, $page);
        Response::paginated($rows, $total, $page, PAGE_SIZE);
    }

    // GET /admin/companies/:id
    public function getCompany(array $params): void
    {
        $this->requireAdmin('companies.view');
        $company = Company::findById($params['id'] ?? '');
        if (!$company) Response::notFound('Company not found.');
        $company['domains']      = Company::getDomains($company['id']);
        $company['subscription'] = Subscription::getCompanySubscription($company['id']);
        Response::success($company);
    }

    // POST /admin/companies
    public function createCompany(array $params): void
    {
        $admin = $this->requireAdmin('companies.create');
        $body  = $this->json();
        $this->validate($body, ['name','email']);

        $companyId = Company::create($body);
        if (!$companyId) Response::error('Could not create company.', 500);

        AuditLog::log($admin['id'], 'admin.create_company', 'company', $companyId, [], ['name' => $body['name']]);
        Response::created(['id' => $companyId], 'Company created.');
    }

    // PUT /admin/companies/:id
    public function updateCompany(array $params): void
    {
        $admin   = $this->requireAdmin('companies.edit');
        $company = Company::findById($params['id'] ?? '');
        if (!$company) Response::notFound('Company not found.');

        $body    = $this->json();
        $allowed = ['name','email','phone','address','logo_url','billing_email','tax_id','status'];
        $update  = array_intersect_key($body, array_flip($allowed));
        Company::update($company['id'], $update);
        AuditLog::log($admin['id'], 'admin.update_company', 'company', $company['id']);
        Response::success(null, 'Company updated.');
    }

    // DELETE /admin/companies/:id
    public function deleteCompany(array $params): void
    {
        $admin   = $this->requireAdmin('companies.delete');
        $company = Company::findById($params['id'] ?? '');
        if (!$company) Response::notFound('Company not found.');

        Company::delete($company['id']);
        AuditLog::log($admin['id'], 'admin.delete_company', 'company', $company['id']);
        Response::success(null, 'Company deleted.');
    }

    // POST /admin/companies/:id/domains
    public function addDomain(array $params): void
    {
        $admin = $this->requireAdmin('companies.edit');
        $body  = $this->json();
        $this->validate($body, ['domain']);
        Company::addDomain($params['id'], $body['domain']);
        AuditLog::log($admin['id'], 'admin.add_domain', 'company', $params['id'], [], ['domain' => $body['domain']]);
        Response::success(null, 'Domain added.');
    }

    // DELETE /admin/companies/:company_id/domains/:id
    public function removeDomain(array $params): void
    {
        $admin = $this->requireAdmin('companies.edit');
        Company::removeDomain($params['id'], $params['company_id']);
        AuditLog::log($admin['id'], 'admin.remove_domain', 'company', $params['company_id']);
        Response::success(null, 'Domain removed.');
    }

    // ── Roles ─────────────────────────────────────────────────

    // GET /admin/roles
    public function listRoles(array $params): void
    {
        $this->requireAdmin('roles.view');
        $roles = Database::query('SELECT * FROM roles ORDER BY name');
        Response::success($roles);
    }

    // POST /admin/roles
    public function createRole(array $params): void
    {
        $admin = $this->requireAdmin('roles.manage');
        $body  = $this->json();
        $this->validate($body, ['name','permissions']);

        $id = Database::insert(
            'INSERT INTO roles (name, description, permissions) VALUES (?, ?, ?) RETURNING id',
            [$body['name'], $body['description'] ?? null, json_encode($body['permissions'])]
        );
        AuditLog::log($admin['id'], 'admin.create_role', 'role', $id);
        Response::created(['id' => $id], 'Role created.');
    }

    // PUT /admin/roles/:id
    public function updateRole(array $params): void
    {
        $admin = $this->requireAdmin('roles.manage');
        $body  = $this->json();
        $sets = [];
        $vals = [];
        foreach (['name', 'description'] as $f) {
            if (isset($body[$f])) { $sets[] = "$f = ?"; $vals[] = $body[$f]; }
        }
        if (!empty($body['permissions'])) {
            $sets[] = 'permissions = ?'; $vals[] = json_encode($body['permissions']);
        }
        if ($sets) {
            $vals[] = $params['id'];
            Database::execute('UPDATE roles SET ' . implode(', ', $sets) . ' WHERE id = ?', $vals);
        }
        AuditLog::log($admin['id'], 'admin.update_role', 'role', $params['id']);
        Response::success(null, 'Role updated.');
    }

    // DELETE /admin/roles/:id
    public function deleteRole(array $params): void
    {
        $admin = $this->requireAdmin('roles.manage');
        Database::execute('DELETE FROM roles WHERE id = ?', [$params['id']]);
        AuditLog::log($admin['id'], 'admin.delete_role', 'role', $params['id']);
        Response::success(null, 'Role deleted.');
    }

    // ── Subscriptions ─────────────────────────────────────────

    // GET /admin/subscriptions
    public function listSubscriptions(array $params): void
    {
        $this->requireAdmin('subscriptions.view');
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $filters = array_intersect_key($_GET, array_flip(['status','company_id']));
        ['rows' => $rows, 'total' => $total] = Subscription::listCompanySubscriptions($filters, $page);
        Response::paginated($rows, $total, $page, PAGE_SIZE);
    }

    // POST /admin/companies/:company_id/subscriptions
    public function createSubscription(array $params): void
    {
        $admin = $this->requireAdmin('subscriptions.manage');
        $body  = $this->json();
        $this->validate($body, ['plan_id','billing_cycle','subscription_type']);

        $id = Subscription::createCompanySubscription(array_merge($body, [
            'company_id' => $params['company_id'],
        ]));
        AuditLog::log($admin['id'], 'admin.create_subscription', 'company', $params['company_id']);
        Response::created(['id' => $id], 'Subscription created.');
    }

    // PUT /admin/subscriptions/:id
    public function updateSubscription(array $params): void
    {
        $admin   = $this->requireAdmin('subscriptions.manage');
        $body    = $this->json();
        $allowed = ['plan_id','billing_cycle','subscription_type','status','max_seats',
                    'current_period_end','amount_per_cycle'];
        $update  = array_intersect_key($body, array_flip($allowed));
        Subscription::updateCompanySubscription($params['id'], $update);
        AuditLog::log($admin['id'], 'admin.update_subscription', 'company_subscription', $params['id']);
        Response::success(null, 'Subscription updated.');
    }

    // ── Reports ───────────────────────────────────────────────

    // GET /admin/reports/revenue
    public function revenueReport(array $params): void
    {
        $this->requireAdmin('reports.view');
        $months = min(36, max(1, (int)($_GET['months'] ?? 12)));
        Response::success([
            'mrr'        => round(Subscription::getMRR(), 2),
            'by_month'   => Subscription::getRevenueByMonth($months),
            'active_subs'=> Subscription::getActiveCount(),
        ]);
    }

    // GET /admin/reports/users
    public function usersReport(array $params): void
    {
        $this->requireAdmin('reports.view');
        Response::success([
            'by_type'       => User::countByType(),
            'new_this_month'=> User::countNewThisMonth(),
        ]);
    }

    // ── Audit Logs ────────────────────────────────────────────

    // GET /admin/audit-logs
    public function auditLogs(array $params): void
    {
        $this->requireAdmin('audit.view');
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $filters = array_intersect_key($_GET, array_flip(['user_id','action','resource_type','from','to']));
        ['rows' => $rows, 'total' => $total] = AuditLog::list($filters, $page);
        Response::paginated($rows, $total, $page, PAGE_SIZE);
    }

    // ── Subscription plans ────────────────────────────────────

    // GET /admin/plans
    public function listPlans(array $params): void
    {
        $this->requireAdmin();
        Response::success(Subscription::getPlans());
    }

    // PUT /admin/plans/:id
    public function updatePlan(array $params): void
    {
        $admin   = $this->requireAdmin('subscriptions.manage');
        $body    = $this->json();
        $allowed = ['name','description','price_monthly','price_yearly','features','is_active','max_seats','max_storage_gb'];
        $sets = [];
        $vals = [];
        foreach ($allowed as $f) {
            if (array_key_exists($f, $body)) {
                $v      = ($f === 'features') ? json_encode($body[$f]) : $body[$f];
                $sets[] = "$f = ?"; $vals[] = $v;
            }
        }
        if ($sets) {
            $vals[] = $params['id'];
            Database::execute('UPDATE subscription_plans SET ' . implode(', ', $sets) . ' WHERE id = ?', $vals);
        }
        AuditLog::log($admin['id'], 'admin.update_plan', 'subscription_plan', $params['id']);
        Response::success(null, 'Plan updated.');
    }

    // ── Helpers ───────────────────────────────────────────────

    private function json(): array
    {
        $raw  = file_get_contents('php://input');
        $data = $raw ? json_decode($raw, true) : [];
        return is_array($data) ? $data : [];
    }

    private function validate(array $data, array $fields): void
    {
        $missing = array_filter($fields, fn($f) => !isset($data[$f]) || $data[$f] === '');
        if ($missing) Response::error('Missing required fields: ' . implode(', ', $missing), 422);
    }
}
