<?php
namespace controllers;

use core\Response;
use middleware\Auth;
use models\AuditLog;
use models\Subscription;

class SubscriptionController
{
    // GET /plans  (public)
    public function listPlans(array $params): void
    {
        $type  = $_GET['type'] ?? 'both';
        $plans = Subscription::getPlans(in_array($type, ['individual','corporate','both']) ? $type : 'both');
        Response::success($plans);
    }

    // GET /plans/:slug  (public)
    public function getPlan(array $params): void
    {
        $plan = Subscription::getPlanBySlug($params['slug'] ?? '');
        if (!$plan) Response::notFound('Plan not found.');
        Response::success($plan);
    }

    // POST /subscribe  (individual users only)
    public function subscribe(array $params): void
    {
        $user = Auth::require(['individual']);

        $body = $this->json();
        $this->validate($body, ['plan_id','billing_cycle']);

        if (!in_array($body['billing_cycle'], ['monthly','yearly'])) {
            Response::error('billing_cycle must be monthly or yearly.');
        }

        $plan = Subscription::getPlanById($body['plan_id']);
        if (!$plan || !$plan['is_active']) {
            Response::notFound('Plan not found or inactive.');
        }

        // Cancel any existing active subscription
        Subscription::cancelIndividualSubscription($user['id']);

        $amount = $body['billing_cycle'] === 'yearly'
            ? ($plan['price_yearly'] ?? $plan['price_monthly'] * 12)
            : $plan['price_monthly'];

        $id = Subscription::createIndividualSubscription([
            'user_id'      => $user['id'],
            'plan_id'      => $plan['id'],
            'billing_cycle'=> $body['billing_cycle'],
            'amount'       => $amount,
            'status'       => 'active',
        ]);

        AuditLog::log($user['id'], 'subscribe', 'individual_subscription', $id, [], [
            'plan' => $plan['name'],
            'cycle'=> $body['billing_cycle'],
        ]);

        Response::created(['id' => $id], 'Subscription activated.');
    }

    // DELETE /subscribe  (cancel individual subscription)
    public function cancel(array $params): void
    {
        $user = Auth::require(['individual']);
        $ok   = Subscription::cancelIndividualSubscription($user['id']);
        if (!$ok) Response::error('No active subscription to cancel.');

        AuditLog::log($user['id'], 'cancel_subscription', 'individual_subscription', $user['id']);
        Response::success(null, 'Subscription cancelled.');
    }

    // GET /subscription/access  (check access for current user)
    public function checkAccess(array $params): void
    {
        $user = Auth::require();
        Response::success(Subscription::checkAccess($user));
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
