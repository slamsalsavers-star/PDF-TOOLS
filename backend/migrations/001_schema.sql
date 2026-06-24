-- ═══════════════════════════════════════════════════════════
--  PDF Tools — Initial Database Schema
--  Run once against the Aiven PostgreSQL instance.
-- ═══════════════════════════════════════════════════════════

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- SUBSCRIPTION PLANS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(50)  NOT NULL,
    description     TEXT,
    price_monthly   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    price_yearly    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    features        JSONB        NOT NULL DEFAULT '[]',
    plan_type       VARCHAR(20)  NOT NULL CHECK (plan_type IN ('individual','corporate','both')),
    max_users       INT          DEFAULT NULL,    -- NULL = unlimited
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order      INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_plan_slug UNIQUE (slug)
);

-- ─────────────────────────────────────────────────────────────
-- COMPANIES  (B2B customers)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    phone           VARCHAR(50),
    address         TEXT,
    logo_url        TEXT,
    billing_email   VARCHAR(255),
    tax_id          VARCHAR(100),
    status          VARCHAR(20)  NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','suspended','cancelled')),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_company_slug UNIQUE (slug)
);

-- ─────────────────────────────────────────────────────────────
-- COMPANY DOMAINS  (domain-based subscription access)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_domains (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    domain          VARCHAR(255) NOT NULL,
    is_verified     BOOLEAN      NOT NULL DEFAULT FALSE,
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_domain UNIQUE (domain)
);

-- ─────────────────────────────────────────────────────────────
-- ROLES  (for admin-side employees)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(50)  NOT NULL,
    description     TEXT,
    permissions     JSONB        NOT NULL DEFAULT '[]',
    is_system       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_role_slug UNIQUE (slug)
);

-- ─────────────────────────────────────────────────────────────
-- USERS  (unified — all user types in one table)
-- user_type:
--   super_admin      → company employees, full platform access
--   admin_employee   → company employees, role-limited
--   corporate_admin  → B2B customer who manages their company
--   corporate_employee → B2B end-user
--   individual       → B2C signup
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email               VARCHAR(255) NOT NULL,
    password_hash       VARCHAR(255),
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    avatar_url          TEXT,
    user_type           VARCHAR(30)  NOT NULL
                            CHECK (user_type IN (
                                'super_admin','admin_employee',
                                'corporate_admin','corporate_employee',
                                'individual'
                            )),
    company_id          UUID         REFERENCES companies(id) ON DELETE SET NULL,
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('active','inactive','suspended','pending')),
    email_verified      BOOLEAN      NOT NULL DEFAULT FALSE,
    email_verified_at   TIMESTAMPTZ,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_email UNIQUE (email)
);

-- ─────────────────────────────────────────────────────────────
-- USER ROLES  (many-to-many, admin employees only)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by UUID        REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, role_id)
);

-- ─────────────────────────────────────────────────────────────
-- COMPANY SUBSCRIPTIONS  (B2B)
-- subscription_type:
--   domain  → all users with matching email domain get access
--   seat    → specific invited users get access
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_subscriptions (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id           UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    plan_id              UUID        NOT NULL REFERENCES subscription_plans(id),
    billing_cycle        VARCHAR(10) NOT NULL CHECK (billing_cycle IN ('monthly','yearly')),
    subscription_type    VARCHAR(20) NOT NULL CHECK (subscription_type IN ('domain','seat')),
    status               VARCHAR(20) NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','cancelled','expired','trial','past_due')),
    active_user_count    INT         NOT NULL DEFAULT 0,
    max_seats            INT         DEFAULT NULL,
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end   TIMESTAMPTZ NOT NULL,
    trial_ends_at        TIMESTAMPTZ,
    cancelled_at         TIMESTAMPTZ,
    amount_per_cycle     DECIMAL(10,2),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- INDIVIDUAL SUBSCRIPTIONS  (B2C)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS individual_subscriptions (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id              UUID        NOT NULL REFERENCES subscription_plans(id),
    billing_cycle        VARCHAR(10) NOT NULL CHECK (billing_cycle IN ('monthly','yearly')),
    status               VARCHAR(20) NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','cancelled','expired','trial','past_due')),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end   TIMESTAMPTZ NOT NULL,
    trial_ends_at        TIMESTAMPTZ,
    cancelled_at         TIMESTAMPTZ,
    amount               DECIMAL(10,2),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- COMPANY INVITATIONS  (seat-based — invite by email)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_invitations (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    invited_email   VARCHAR(255) NOT NULL,
    invited_by      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token           VARCHAR(255) NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','accepted','expired','revoked')),
    expires_at      TIMESTAMPTZ  NOT NULL,
    accepted_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_invite_token  UNIQUE (token),
    CONSTRAINT uq_invite_email  UNIQUE (company_id, invited_email)
);

-- ─────────────────────────────────────────────────────────────
-- REFRESH TOKENS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(512) NOT NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,
    revoked_at  TIMESTAMPTZ,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_refresh_token UNIQUE (token)
);

-- ─────────────────────────────────────────────────────────────
-- PASSWORD RESET TOKENS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_prt UNIQUE (token)
);

-- ─────────────────────────────────────────────────────────────
-- EMAIL VERIFICATION TOKENS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_evt UNIQUE (token)
);

-- ─────────────────────────────────────────────────────────────
-- INVOICES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number      VARCHAR(50)  NOT NULL,
    company_id          UUID         REFERENCES companies(id) ON DELETE SET NULL,
    user_id             UUID         REFERENCES users(id) ON DELETE SET NULL,
    subscription_id     UUID,
    subscription_type   VARCHAR(20)  CHECK (subscription_type IN ('company','individual')),
    amount              DECIMAL(10,2) NOT NULL,
    tax_amount          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    currency            VARCHAR(3)   NOT NULL DEFAULT 'USD',
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','paid','failed','refunded','void')),
    due_date            DATE,
    paid_at             TIMESTAMPTZ,
    period_start        DATE,
    period_end          DATE,
    notes               TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_invoice_number UNIQUE (invoice_number)
);

-- ─────────────────────────────────────────────────────────────
-- AUDIT LOGS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,
    resource_type   VARCHAR(50),
    resource_id     VARCHAR(255),
    old_values      JSONB,
    new_values      JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_company        ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_type_status    ON users(user_type, status);

CREATE INDEX IF NOT EXISTS idx_domains_domain       ON company_domains(domain);
CREATE INDEX IF NOT EXISTS idx_domains_company      ON company_domains(company_id);

CREATE INDEX IF NOT EXISTS idx_co_subs_company      ON company_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_co_subs_status       ON company_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_co_subs_period_end   ON company_subscriptions(current_period_end);

CREATE INDEX IF NOT EXISTS idx_ind_subs_user        ON individual_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_ind_subs_status      ON individual_subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_invitations_token    ON company_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email    ON company_invitations(invited_email);
CREATE INDEX IF NOT EXISTS idx_invitations_company  ON company_invitations(company_id);

CREATE INDEX IF NOT EXISTS idx_refresh_token        ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_user         ON refresh_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_user           ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created        ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action         ON audit_logs(action);

CREATE INDEX IF NOT EXISTS idx_invoices_company     ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user        ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status      ON invoices(status);

-- ═══════════════════════════════════════════════════════════
-- TRIGGER: auto-update updated_at
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at') THEN
        CREATE TRIGGER trg_users_updated_at
            BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_companies_updated_at') THEN
        CREATE TRIGGER trg_companies_updated_at
            BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_plans_updated_at') THEN
        CREATE TRIGGER trg_plans_updated_at
            BEFORE UPDATE ON subscription_plans FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_co_subs_updated_at') THEN
        CREATE TRIGGER trg_co_subs_updated_at
            BEFORE UPDATE ON company_subscriptions FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ind_subs_updated_at') THEN
        CREATE TRIGGER trg_ind_subs_updated_at
            BEFORE UPDATE ON individual_subscriptions FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_invoices_updated_at') THEN
        CREATE TRIGGER trg_invoices_updated_at
            BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_roles_updated_at') THEN
        CREATE TRIGGER trg_roles_updated_at
            BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
-- SEED: SUBSCRIPTION PLANS
-- ═══════════════════════════════════════════════════════════
INSERT INTO subscription_plans (name, slug, description, price_monthly, price_yearly, features, plan_type, max_users, sort_order)
VALUES
(
    'Free', 'free', 'Basic PDF tools for everyone.',
    0.00, 0.00,
    '["Merge up to 3 PDFs","Split PDFs","Basic PDF viewing"]',
    'both', NULL, 1
),
(
    'Pro', 'pro', 'Full PDF suite for individuals.',
    9.99, 99.99,
    '["Unlimited PDF Merge","PDF Split & Extract","PDF to Word","Full PDF Editor","Priority Support"]',
    'individual', 1, 2
),
(
    'Business', 'business', 'PDF tools for growing teams.',
    29.99, 299.99,
    '["Everything in Pro","Up to 25 users","Team management","Usage reports","Domain-based access","Dedicated support"]',
    'corporate', 25, 3
),
(
    'Enterprise', 'enterprise', 'Unlimited PDF tools for large organisations.',
    99.99, 999.99,
    '["Everything in Business","Unlimited users","Custom integrations","SSO support","SLA guarantee","Account manager"]',
    'corporate', NULL, 4
)
ON CONFLICT (slug) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- SEED: ADMIN ROLES
-- ═══════════════════════════════════════════════════════════
INSERT INTO roles (name, slug, description, permissions, is_system)
VALUES
(
    'Super Admin', 'super_admin',
    'Full system access — can manage everything including other admins.',
    '["*"]', TRUE
),
(
    'Admin', 'admin',
    'Can manage users, companies, subscriptions, and view reports.',
    '["users.view","users.create","users.edit","users.delete","companies.view","companies.create","companies.edit","subscriptions.view","subscriptions.edit","reports.view","revenue.view","invoices.view"]',
    TRUE
),
(
    'Support', 'support',
    'Can view and edit user/company details for support purposes.',
    '["users.view","users.edit","companies.view","subscriptions.view","reports.view"]',
    TRUE
),
(
    'Billing', 'billing',
    'Manages subscriptions and views revenue.',
    '["subscriptions.view","subscriptions.edit","subscriptions.delete","revenue.view","invoices.view","invoices.edit","reports.view"]',
    TRUE
),
(
    'Viewer', 'viewer',
    'Read-only access to all admin data.',
    '["users.view","companies.view","subscriptions.view","reports.view","revenue.view","invoices.view"]',
    TRUE
)
ON CONFLICT (slug) DO NOTHING;

COMMIT;

-- ═══════════════════════════════════════════════════════════
-- NOTE: Run setup.php to create the initial Super Admin user.
-- ═══════════════════════════════════════════════════════════
