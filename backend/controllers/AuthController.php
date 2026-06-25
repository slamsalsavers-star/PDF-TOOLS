<?php
namespace controllers;

use core\Database;
use core\JWT;
use core\Mailer;
use core\Response;
use middleware\Auth;
use models\AuditLog;
use models\Company;
use models\User;

class AuthController
{
    // POST /auth/register
    public function register(array $params): void
    {
        $body = $this->json();
        $this->validate($body, ['email','password','first_name','last_name']);

        $email = strtolower(trim($body['email']));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Invalid email address.');
        }
        if (strlen($body['password']) < 8) {
            Response::error('Password must be at least 8 characters.');
        }
        if (User::findByEmail($email)) {
            Response::error('An account with this email already exists.', 409);
        }

        $company  = Company::findByEmailDomain($email);
        $userType = $company ? 'corporate_employee' : 'individual';

        $userId = User::create([
            'email'         => $email,
            'password_hash' => password_hash($body['password'], PASSWORD_BCRYPT),
            'first_name'    => trim($body['first_name']),
            'last_name'     => trim($body['last_name']),
            'user_type'     => $userType,
            'company_id'    => $company['id'] ?? null,
            'status'        => 'pending',
        ]);

        if (!$userId) Response::error('Could not create account. Please try again.', 500);

        $token     = $this->createToken('email_verification_tokens', $userId, EMAIL_VERIFY_TTL);
        $verifyUrl = APP_URL . '/backend/auth/verify-email?token=' . urlencode($token);
        (new Mailer())->sendWelcome($email, $body['first_name'], $verifyUrl);

        AuditLog::log($userId, 'register', 'user', $userId);
        Response::created(['user_id' => $userId], 'Account created. Please check your email to verify.');
    }

    // POST /auth/login
    public function login(array $params): void
    {
        $body = $this->json();
        $this->validate($body, ['email','password']);

        $user = User::findByEmail($body['email']);
        if (!$user || !password_verify($body['password'], $user['password_hash'])) {
            Response::error('Invalid email or password.', 401);
        }
        if ($user['status'] === 'suspended') {
            Response::error('Your account has been suspended. Please contact support.', 403);
        }
        if (!$user['email_verified']) {
            Response::error('Please verify your email address before logging in.', 403);
        }
        if ($user['status'] !== 'active') {
            Response::error('Your account is not active.', 403);
        }

        [$accessToken, $refreshToken] = $this->issueTokens($user);
        User::recordLogin($user['id']);
        AuditLog::log($user['id'], 'login', 'user', $user['id']);

        Response::success([
            'access_token'  => $accessToken,
            'refresh_token' => $refreshToken,
            'user'          => User::safe($user),
        ]);
    }

    // POST /auth/refresh
    public function refresh(array $params): void
    {
        $body  = $this->json();
        $token = $body['refresh_token'] ?? '';

        if (!$token) Response::error('Refresh token required.');

        $row = Database::queryOne(
            "SELECT * FROM refresh_tokens WHERE token = ? AND revoked = FALSE AND expires_at > NOW()",
            [$token]
        );
        if (!$row) Response::unauthorized('Invalid or expired refresh token.');

        $user = User::findById($row['user_id']);
        if (!$user || $user['status'] !== 'active') Response::unauthorized('User not found or inactive.');

        Database::execute('UPDATE refresh_tokens SET revoked = TRUE WHERE id = ?', [$row['id']]);

        [$accessToken, $refreshToken] = $this->issueTokens($user);
        Response::success(['access_token' => $accessToken, 'refresh_token' => $refreshToken]);
    }

    // POST /auth/logout
    public function logout(array $params): void
    {
        $body  = $this->json(false);
        $token = $body['refresh_token'] ?? '';
        if ($token) {
            Database::execute('UPDATE refresh_tokens SET revoked = TRUE WHERE token = ?', [$token]);
        }
        Response::success(null, 'Logged out successfully.');
    }

    // GET /auth/verify-email
    public function verifyEmail(array $params): void
    {
        $token = $_GET['token'] ?? '';
        if (!$token) Response::error('Verification token required.');

        $row = Database::queryOne(
            "SELECT * FROM email_verification_tokens WHERE token = ? AND used = FALSE AND expires_at > NOW()",
            [$token]
        );
        if (!$row) Response::error('Invalid or expired verification token.', 400);

        User::verifyEmail($row['user_id']);
        Database::execute('UPDATE email_verification_tokens SET used = TRUE WHERE id = ?', [$row['id']]);
        AuditLog::log($row['user_id'], 'verify_email', 'user', $row['user_id']);

        Response::success(null, 'Email verified successfully. You can now log in.');
    }

    // POST /auth/resend-verification
    public function resendVerification(array $params): void
    {
        $body = $this->json();
        $this->validate($body, ['email']);

        $user = User::findByEmail($body['email']);
        if (!$user || $user['email_verified']) {
            Response::success(null, 'If your email is registered and unverified, you will receive a new link.');
        }

        $token     = $this->createToken('email_verification_tokens', $user['id'], EMAIL_VERIFY_TTL);
        $verifyUrl = APP_URL . '/backend/auth/verify-email?token=' . urlencode($token);
        (new Mailer())->sendWelcome($user['email'], $user['first_name'], $verifyUrl);

        Response::success(null, 'If your email is registered and unverified, you will receive a new link.');
    }

    // POST /auth/forgot-password
    public function forgotPassword(array $params): void
    {
        $body = $this->json();
        $this->validate($body, ['email']);

        $user = User::findByEmail($body['email']);
        if ($user && $user['status'] === 'active') {
            Database::execute(
                "UPDATE password_reset_tokens SET used = TRUE WHERE user_id = ? AND used = FALSE",
                [$user['id']]
            );
            $token    = $this->createToken('password_reset_tokens', $user['id'], PASSWORD_RESET_TTL);
            $resetUrl = APP_URL . '/reset-password?token=' . urlencode($token);
            (new Mailer())->sendPasswordReset($user['email'], $user['first_name'], $resetUrl);
        }
        Response::success(null, 'If an account with that email exists, a reset link has been sent.');
    }

    // POST /auth/reset-password
    public function resetPassword(array $params): void
    {
        $body = $this->json();
        $this->validate($body, ['token','password']);

        if (strlen($body['password']) < 8) {
            Response::error('Password must be at least 8 characters.');
        }

        $row = Database::queryOne(
            "SELECT * FROM password_reset_tokens WHERE token = ? AND used = FALSE AND expires_at > NOW()",
            [$body['token']]
        );
        if (!$row) Response::error('Invalid or expired reset token.');

        User::update($row['user_id'], ['password_hash' => password_hash($body['password'], PASSWORD_BCRYPT)]);
        Database::execute('UPDATE password_reset_tokens SET used = TRUE WHERE id = ?', [$row['id']]);
        Database::execute('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = ?', [$row['user_id']]);
        AuditLog::log($row['user_id'], 'password_reset', 'user', $row['user_id']);

        Response::success(null, 'Password reset successfully.');
    }

    // POST /auth/change-password  (requires auth)
    public function changePassword(array $params): void
    {
        $user = Auth::require();
        $body = $this->json();
        $this->validate($body, ['current_password','new_password']);

        if (!password_verify($body['current_password'], $user['password_hash'])) {
            Response::error('Current password is incorrect.', 400);
        }
        if (strlen($body['new_password']) < 8) {
            Response::error('New password must be at least 8 characters.');
        }

        User::update($user['id'], ['password_hash' => password_hash($body['new_password'], PASSWORD_BCRYPT)]);
        Database::execute('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = ?', [$user['id']]);
        AuditLog::log($user['id'], 'change_password', 'user', $user['id']);

        Response::success(null, 'Password changed successfully.');
    }

    // GET /auth/check-domain?email=xxx@company.com
    public function checkDomain(array $params): void
    {
        $email   = $_GET['email'] ?? '';
        $company = Company::findByEmailDomain($email);

        Response::success([
            'is_corporate' => (bool) $company,
            'company_name' => $company['name'] ?? null,
        ]);
    }

    // POST /auth/accept-invitation
    public function acceptInvitation(array $params): void
    {
        $body = $this->json();
        $this->validate($body, ['token','password','first_name','last_name']);

        $invitation = Company::getInvitationByToken($body['token']);
        if (!$invitation) Response::error('Invalid or expired invitation.', 400);

        if (strlen($body['password']) < 8) {
            Response::error('Password must be at least 8 characters.');
        }

        $existing = User::findByEmail($invitation['invited_email']);
        if ($existing) {
            User::update($existing['id'], [
                'company_id' => $invitation['company_id'],
                'user_type'  => 'corporate_employee',
            ]);
            Company::acceptInvitation($body['token']);
            AuditLog::log($existing['id'], 'accept_invitation', 'company', $invitation['company_id']);
            Response::success(null, 'You have joined the company. Please log in.');
        }

        Database::beginTransaction();
        try {
            $userId = User::create([
                'email'         => $invitation['invited_email'],
                'password_hash' => password_hash($body['password'], PASSWORD_BCRYPT),
                'first_name'    => trim($body['first_name']),
                'last_name'     => trim($body['last_name']),
                'user_type'     => 'corporate_employee',
                'company_id'    => $invitation['company_id'],
                'status'        => 'active',
            ]);
            User::verifyEmail($userId);
            Company::acceptInvitation($body['token']);
            Database::commit();
        } catch (\Exception $e) {
            Database::rollback();
            Response::error('Could not create account.', 500);
        }

        AuditLog::log($userId, 'register_via_invitation', 'company', $invitation['company_id']);
        Response::created(null, 'Account created. You can now log in.');
    }

    // ── Internals ─────────────────────────────────────────────

    private function issueTokens(array $user): array
    {
        $payload = [
            'sub'       => $user['id'],
            'user_type' => $user['user_type'],
            'company_id'=> $user['company_id'],
        ];
        $accessToken  = JWT::encode($payload, JWT_ACCESS_TTL);
        $refreshToken = bin2hex(random_bytes(40));
        $expiresAt    = date('Y-m-d H:i:sP', time() + JWT_REFRESH_TTL);

        Database::execute(
            'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
            [$user['id'], $refreshToken, $expiresAt]
        );

        return [$accessToken, $refreshToken];
    }

    private function createToken(string $table, string $userId, int $ttl): string
    {
        $token     = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:sP', time() + $ttl);
        Database::execute(
            "INSERT INTO {$table} (user_id, token, expires_at) VALUES (?, ?, ?)",
            [$userId, $token, $expiresAt]
        );
        return $token;
    }

    private function json(bool $required = true): array
    {
        $raw = file_get_contents('php://input');
        $data = $raw ? json_decode($raw, true) : [];
        if ($required && !is_array($data)) Response::error('Request body must be valid JSON.');
        return $data ?? [];
    }

    private function validate(array $data, array $fields): void
    {
        $missing = array_filter($fields, fn($f) => empty($data[$f]));
        if ($missing) {
            Response::error('Missing required fields: ' . implode(', ', $missing), 422);
        }
    }
}
