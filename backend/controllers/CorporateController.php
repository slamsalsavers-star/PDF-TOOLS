<?php
namespace controllers;

use core\Mailer;
use core\Response;
use middleware\Auth;
use models\AuditLog;
use models\Company;
use models\Subscription;
use models\User;

class CorporateController
{
    private function requireCorporateAdmin(): array
    {
        return Auth::require(['corporate_admin', 'super_admin', 'admin_employee']);
    }

    private function requireCorporate(): array
    {
        return Auth::require(['corporate_admin', 'corporate_employee', 'super_admin', 'admin_employee']);
    }

    // GET /corporate/dashboard
    public function dashboard(array $params): void
    {
        $user    = $this->requireCorporateAdmin();
        $company = Company::findById($user['company_id'] ?? '');
        if (!$company) Response::notFound('Company not found.');

        $sub = Subscription::getCompanySubscription($company['id']);
        ['rows' => $employees, 'total' => $total] = User::list(['company_id' => $company['id']]);

        Response::success([
            'company'      => $company,
            'subscription' => $sub,
            'employee_count'   => $total,
            'domains'      => Company::getDomains($company['id']),
        ]);
    }

    // GET /corporate/employees
    public function listEmployees(array $params): void
    {
        $user = $this->requireCorporateAdmin();
        $page = max(1, (int)($_GET['page'] ?? 1));
        ['rows' => $rows, 'total' => $total] = User::list(['company_id' => $user['company_id']], $page);
        Response::paginated($rows, $total, $page, PAGE_SIZE);
    }

    // DELETE /corporate/employees/:id
    public function removeEmployee(array $params): void
    {
        $admin = $this->requireCorporateAdmin();

        $target = User::findById($params['id'] ?? '');
        if (!$target || $target['company_id'] !== $admin['company_id']) {
            Response::notFound('Employee not found.');
        }
        if ($target['id'] === $admin['id']) {
            Response::error('You cannot remove yourself.', 400);
        }

        // Detach from company rather than deleting the account
        User::update($target['id'], ['company_id' => null, 'user_type' => 'individual']);
        AuditLog::log($admin['id'], 'corporate.remove_employee', 'user', $target['id']);
        Response::success(null, 'Employee removed from company.');
    }

    // GET /corporate/invitations
    public function listInvitations(array $params): void
    {
        $user = $this->requireCorporateAdmin();
        Response::success(Company::listInvitations($user['company_id']));
    }

    // POST /corporate/invitations
    public function sendInvitation(array $params): void
    {
        $admin = $this->requireCorporateAdmin();
        $body  = $this->json();
        $this->validate($body, ['email']);

        $email = strtolower(trim($body['email']));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Invalid email address.');
        }

        // Check subscription type allows seat-based invitations
        $sub = Subscription::getCompanySubscription($admin['company_id']);
        if (!$sub || !in_array($sub['status'], ['active', 'trial'])) {
            Response::error('No active subscription found.', 403);
        }

        // Seat limit check (only for seat-based subscriptions)
        if ($sub['subscription_type'] === 'seat' && $sub['max_seats']) {
            ['total' => $employeeCount] = User::list(['company_id' => $admin['company_id']]);
            if ($employeeCount >= $sub['max_seats']) {
                Response::error("You have reached your seat limit ({$sub['max_seats']}). Please upgrade.", 403);
            }
        }

        $invitationId = Company::createInvitation($admin['company_id'], $email, $admin['id']);
        $inv          = Company::getInvitationByToken(''); // We need the token — fetch it fresh
        $inv          = \core\Database::queryOne(
            'SELECT token FROM company_invitations WHERE id = ?', [$invitationId]
        );
        $acceptUrl    = APP_URL . '/accept-invitation?token=' . urlencode($inv['token'] ?? '');
        $company      = Company::findById($admin['company_id']);

        (new Mailer())->sendInvitation(
            $email,
            $company['name'],
            $admin['first_name'] . ' ' . $admin['last_name'],
            $acceptUrl
        );

        AuditLog::log($admin['id'], 'corporate.invite', 'company', $admin['company_id'], [], ['email' => $email]);
        Response::created(['id' => $invitationId], 'Invitation sent.');
    }

    // DELETE /corporate/invitations/:id
    public function revokeInvitation(array $params): void
    {
        $admin = $this->requireCorporateAdmin();
        Company::revokeInvitation($params['id'], $admin['company_id']);
        AuditLog::log($admin['id'], 'corporate.revoke_invitation', 'company', $admin['company_id']);
        Response::success(null, 'Invitation revoked.');
    }

    // GET /corporate/domains
    public function listDomains(array $params): void
    {
        $user = $this->requireCorporateAdmin();
        Response::success(Company::getDomains($user['company_id']));
    }

    // POST /corporate/domains
    public function addDomain(array $params): void
    {
        $admin = $this->requireCorporateAdmin();
        $body  = $this->json();
        $this->validate($body, ['domain']);

        $sub = Subscription::getCompanySubscription($admin['company_id']);
        if (!$sub || $sub['subscription_type'] !== 'domain') {
            Response::error('Domain-based access requires a domain subscription.', 403);
        }

        Company::addDomain($admin['company_id'], $body['domain']);
        AuditLog::log($admin['id'], 'corporate.add_domain', 'company', $admin['company_id'], [], ['domain' => $body['domain']]);
        Response::success(null, 'Domain added.');
    }

    // DELETE /corporate/domains/:id
    public function removeDomain(array $params): void
    {
        $admin = $this->requireCorporateAdmin();
        Company::removeDomain($params['id'], $admin['company_id']);
        AuditLog::log($admin['id'], 'corporate.remove_domain', 'company', $admin['company_id']);
        Response::success(null, 'Domain removed.');
    }

    // GET /corporate/subscription
    public function getSubscription(array $params): void
    {
        $user = $this->requireCorporate();
        $sub  = Subscription::getCompanySubscription($user['company_id'] ?? '');
        if (!$sub) Response::notFound('No active subscription found.');
        Response::success($sub);
    }

    // GET /corporate/profile
    public function getProfile(array $params): void
    {
        $user    = $this->requireCorporateAdmin();
        $company = Company::findById($user['company_id'] ?? '');
        if (!$company) Response::notFound('Company not found.');
        Response::success($company);
    }

    // PUT /corporate/profile
    public function updateProfile(array $params): void
    {
        $admin   = $this->requireCorporateAdmin();
        $body    = $this->json();
        $allowed = ['name','email','phone','address','logo_url','billing_email','tax_id'];
        $update  = array_intersect_key($body, array_flip($allowed));
        Company::update($admin['company_id'], $update);
        AuditLog::log($admin['id'], 'corporate.update_profile', 'company', $admin['company_id']);
        Response::success(null, 'Company profile updated.');
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
