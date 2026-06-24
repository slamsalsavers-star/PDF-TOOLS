<?php
declare(strict_types=1);

// ── Bootstrap ─────────────────────────────────────────────────────────────────

define('ROOT_DIR', __DIR__);
require ROOT_DIR . '/config/app.php';

// Autoloader — maps namespaces to directories under ROOT_DIR
spl_autoload_register(function (string $class): void {
    $path = ROOT_DIR . '/' . str_replace('\\', '/', $class) . '.php';
    if (file_exists($path)) {
        require $path;
    }
});

// ── CORS ──────────────────────────────────────────────────────────────────────

$allowedOrigins = defined('ALLOWED_ORIGINS')
    ? explode(',', ALLOWED_ORIGINS)
    : [APP_URL];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true) || APP_ENV === 'development') {
    header('Access-Control-Allow-Origin: ' . ($origin ?: '*'));
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Route matching ────────────────────────────────────────────────────────────

$router = new \core\Router();

// ── Auth ──────────────────────────────────────────────────────────────────────
$router->post('/auth/register',              [\controllers\AuthController::class, 'register']);
$router->post('/auth/login',                 [\controllers\AuthController::class, 'login']);
$router->post('/auth/refresh',               [\controllers\AuthController::class, 'refresh']);
$router->post('/auth/logout',                [\controllers\AuthController::class, 'logout']);
$router->get ('/auth/verify-email',          [\controllers\AuthController::class, 'verifyEmail']);
$router->post('/auth/resend-verification',   [\controllers\AuthController::class, 'resendVerification']);
$router->post('/auth/forgot-password',       [\controllers\AuthController::class, 'forgotPassword']);
$router->post('/auth/reset-password',        [\controllers\AuthController::class, 'resetPassword']);
$router->post('/auth/change-password',       [\controllers\AuthController::class, 'changePassword']);
$router->get ('/auth/check-domain',          [\controllers\AuthController::class, 'checkDomain']);
$router->post('/auth/accept-invitation',     [\controllers\AuthController::class, 'acceptInvitation']);

// ── Current user ──────────────────────────────────────────────────────────────
$router->get   ('/user/profile',             [\controllers\UserController::class, 'profile']);
$router->put   ('/user/profile',             [\controllers\UserController::class, 'updateProfile']);
$router->delete('/user/account',             [\controllers\UserController::class, 'deleteAccount']);

// ── Plans & subscriptions (individual) ───────────────────────────────────────
$router->get   ('/plans',                    [\controllers\SubscriptionController::class, 'listPlans']);
$router->get   ('/plans/:slug',              [\controllers\SubscriptionController::class, 'getPlan']);
$router->post  ('/subscribe',                [\controllers\SubscriptionController::class, 'subscribe']);
$router->delete('/subscribe',                [\controllers\SubscriptionController::class, 'cancel']);
$router->get   ('/subscription/access',      [\controllers\SubscriptionController::class, 'checkAccess']);

// ── Corporate ─────────────────────────────────────────────────────────────────
$router->get   ('/corporate/dashboard',      [\controllers\CorporateController::class, 'dashboard']);
$router->get   ('/corporate/profile',        [\controllers\CorporateController::class, 'getProfile']);
$router->put   ('/corporate/profile',        [\controllers\CorporateController::class, 'updateProfile']);
$router->get   ('/corporate/employees',      [\controllers\CorporateController::class, 'listEmployees']);
$router->delete('/corporate/employees/:id',  [\controllers\CorporateController::class, 'removeEmployee']);
$router->get   ('/corporate/invitations',    [\controllers\CorporateController::class, 'listInvitations']);
$router->post  ('/corporate/invitations',    [\controllers\CorporateController::class, 'sendInvitation']);
$router->delete('/corporate/invitations/:id',[\controllers\CorporateController::class, 'revokeInvitation']);
$router->get   ('/corporate/domains',        [\controllers\CorporateController::class, 'listDomains']);
$router->post  ('/corporate/domains',        [\controllers\CorporateController::class, 'addDomain']);
$router->delete('/corporate/domains/:id',    [\controllers\CorporateController::class, 'removeDomain']);
$router->get   ('/corporate/subscription',   [\controllers\CorporateController::class, 'getSubscription']);

// ── Admin ─────────────────────────────────────────────────────────────────────
$router->get   ('/admin/dashboard',          [\controllers\AdminController::class, 'dashboard']);

// Users
$router->get   ('/admin/users',              [\controllers\AdminController::class, 'listUsers']);
$router->post  ('/admin/users',              [\controllers\AdminController::class, 'createUser']);
$router->get   ('/admin/users/:id',          [\controllers\AdminController::class, 'getUser']);
$router->put   ('/admin/users/:id',          [\controllers\AdminController::class, 'updateUser']);
$router->delete('/admin/users/:id',          [\controllers\AdminController::class, 'deleteUser']);
$router->post  ('/admin/users/:id/roles',    [\controllers\AdminController::class, 'assignRole']);
$router->delete('/admin/users/:id/roles/:role_id', [\controllers\AdminController::class, 'removeRole']);

// Companies
$router->get   ('/admin/companies',          [\controllers\AdminController::class, 'listCompanies']);
$router->post  ('/admin/companies',          [\controllers\AdminController::class, 'createCompany']);
$router->get   ('/admin/companies/:id',      [\controllers\AdminController::class, 'getCompany']);
$router->put   ('/admin/companies/:id',      [\controllers\AdminController::class, 'updateCompany']);
$router->delete('/admin/companies/:id',      [\controllers\AdminController::class, 'deleteCompany']);
$router->post  ('/admin/companies/:id/domains',         [\controllers\AdminController::class, 'addDomain']);
$router->delete('/admin/companies/:company_id/domains/:id', [\controllers\AdminController::class, 'removeDomain']);
$router->post  ('/admin/companies/:company_id/subscriptions', [\controllers\AdminController::class, 'createSubscription']);

// Roles
$router->get   ('/admin/roles',              [\controllers\AdminController::class, 'listRoles']);
$router->post  ('/admin/roles',              [\controllers\AdminController::class, 'createRole']);
$router->put   ('/admin/roles/:id',          [\controllers\AdminController::class, 'updateRole']);
$router->delete('/admin/roles/:id',          [\controllers\AdminController::class, 'deleteRole']);

// Subscriptions & plans
$router->get   ('/admin/subscriptions',      [\controllers\AdminController::class, 'listSubscriptions']);
$router->put   ('/admin/subscriptions/:id',  [\controllers\AdminController::class, 'updateSubscription']);
$router->get   ('/admin/plans',              [\controllers\AdminController::class, 'listPlans']);
$router->put   ('/admin/plans/:id',          [\controllers\AdminController::class, 'updatePlan']);

// Reports & audit
$router->get   ('/admin/reports/revenue',    [\controllers\AdminController::class, 'revenueReport']);
$router->get   ('/admin/reports/users',      [\controllers\AdminController::class, 'usersReport']);
$router->get   ('/admin/audit-logs',         [\controllers\AdminController::class, 'auditLogs']);

// ── Dispatch ──────────────────────────────────────────────────────────────────

$method  = $_SERVER['REQUEST_METHOD'];
$uri     = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Strip the /backend prefix if the app lives in a subfolder
$prefix  = rtrim(parse_url(APP_URL, PHP_URL_PATH) ?? '', '/') . '/backend';
if (str_starts_with($uri, $prefix)) {
    $uri = substr($uri, strlen($prefix)) ?: '/';
}

$router->dispatch($method, $uri);
