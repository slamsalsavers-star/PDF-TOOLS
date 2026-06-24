<?php
namespace controllers;

use core\Database;
use core\Response;
use middleware\Auth;
use models\AuditLog;
use models\Subscription;
use models\User;

class UserController
{
    // GET /user/profile
    public function profile(array $params): void
    {
        $user             = Auth::require();
        $safe             = User::safe($user);
        $safe['access']   = Subscription::checkAccess($user);
        $safe['subscription'] = $this->activeSubscription($user);
        Response::success($safe);
    }

    // PUT /user/profile
    public function updateProfile(array $params): void
    {
        $user    = Auth::require();
        $body    = $this->json();
        $allowed = ['first_name','last_name','avatar_url'];
        $update  = array_intersect_key($body, array_flip($allowed));

        if (empty($update)) Response::error('No valid fields to update.');

        User::update($user['id'], $update);
        AuditLog::log($user['id'], 'profile.update', 'user', $user['id']);
        Response::success(null, 'Profile updated.');
    }

    // DELETE /user/account
    public function deleteAccount(array $params): void
    {
        $user = Auth::require();
        $body = $this->json(false);

        if (empty($body['password']) || !password_verify($body['password'], $user['password_hash'])) {
            Response::error('Password is required to delete your account.', 400);
        }

        Subscription::cancelIndividualSubscription($user['id']);
        Database::execute('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = ?', [$user['id']]);
        User::update($user['id'], ['status' => 'suspended']);

        AuditLog::log($user['id'], 'account.delete', 'user', $user['id']);
        Response::success(null, 'Account deleted.');
    }

    // ── Helpers ───────────────────────────────────────────────

    private function activeSubscription(array $user): ?array
    {
        if (in_array($user['user_type'], ['individual'])) {
            return Subscription::getIndividualSubscription($user['id']);
        }
        if ($user['company_id']) {
            return Subscription::getCompanySubscription($user['company_id']);
        }
        return null;
    }

    private function json(bool $required = true): array
    {
        $raw  = file_get_contents('php://input');
        $data = $raw ? json_decode($raw, true) : [];
        if ($required && !is_array($data)) Response::error('Request body must be valid JSON.');
        return $data ?? [];
    }
}
