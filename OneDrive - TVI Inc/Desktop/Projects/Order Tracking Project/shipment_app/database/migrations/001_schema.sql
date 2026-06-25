-- ShipmentMS — complete multi-tenant schema
-- Run via: node database/setup.js

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Tenants ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  plan        VARCHAR(50)  NOT NULL DEFAULT 'starter',
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  settings    JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Roles & Permissions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  is_system   BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS permissions (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module  VARCHAR(100) NOT NULL,
  action  VARCHAR(50)  NOT NULL,
  UNIQUE(module, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id        UUID         REFERENCES roles(id) ON DELETE SET NULL,
  email          VARCHAR(255) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  full_name      VARCHAR(255) NOT NULL,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Reference data (shared across tenants) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS countries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(3)   NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS provinces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id  UUID         NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS cities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  province_id UUID         NOT NULL REFERENCES provinces(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

-- ─── Tenant master data ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facilities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  city_id     UUID         REFERENCES cities(id) ON DELETE SET NULL,
  address     TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forwarders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  code        VARCHAR(50),
  contact     VARCHAR(255),
  email       VARCHAR(255),
  phone       VARCHAR(100),
  address     TEXT,
  notes       TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipping_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  code         VARCHAR(30)  NOT NULL,
  api_base_url VARCHAR(500),
  api_key      TEXT,
  api_secret   TEXT,
  extra_config JSONB        NOT NULL DEFAULT '{}',
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  notes        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS shipping_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  is_required BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS statuses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  description VARCHAR(100) NOT NULL,
  color       VARCHAR(30)  NOT NULL DEFAULT 'gray',
  sort_order  INT          NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  UNIQUE(tenant_id, description)
);

CREATE TABLE IF NOT EXISTS shipment_creation_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  description VARCHAR(100) NOT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  UNIQUE(tenant_id, description)
);

CREATE TABLE IF NOT EXISTS shipment_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  description VARCHAR(100) NOT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  UNIQUE(tenant_id, description)
);

-- ─── Customers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alias                VARCHAR(100) NOT NULL,
  description          VARCHAR(255) NOT NULL,
  customer_type        VARCHAR(50),
  address              TEXT,
  country_id           UUID         REFERENCES countries(id) ON DELETE SET NULL,
  primary_forwarder_id UUID         REFERENCES forwarders(id) ON DELETE SET NULL,
  special_notes        TEXT,
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, alias)
);

CREATE TABLE IF NOT EXISTS customer_emails (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          UUID    NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  email                VARCHAR(255) NOT NULL,
  for_orders           BOOLEAN NOT NULL DEFAULT FALSE,
  for_shipping_docset  BOOLEAN NOT NULL DEFAULT FALSE,
  for_general          BOOLEAN NOT NULL DEFAULT FALSE,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS customer_shipping_documents (
  customer_id          UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  shipping_document_id UUID NOT NULL REFERENCES shipping_documents(id) ON DELETE CASCADE,
  PRIMARY KEY (customer_id, shipping_document_id)
);

-- ─── Bookings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reference            VARCHAR(255),
  booking_number       VARCHAR(255) NOT NULL,
  booking_type         VARCHAR(100),
  booking_received_date DATE,
  cut_off              DATE,
  vessel               VARCHAR(200),
  voyage               VARCHAR(100),
  eta                  DATE,
  rail                 VARCHAR(100),
  shipping_line_id     UUID         REFERENCES shipping_lines(id) ON DELETE SET NULL,
  description          TEXT,
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Shipments ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_number         VARCHAR(255) NOT NULL,
  reference            VARCHAR(255),
  facility_id          UUID         REFERENCES facilities(id) ON DELETE SET NULL,
  forwarder_id         UUID         REFERENCES forwarders(id) ON DELETE SET NULL,
  booking_id           UUID         REFERENCES bookings(id) ON DELETE SET NULL,
  carrier              VARCHAR(255),
  despatch_date        DATE,
  place_of_destination VARCHAR(255),
  country              VARCHAR(255),
  customer             VARCHAR(255),
  consignee            VARCHAR(255),
  transport_mode       VARCHAR(100),
  field                VARCHAR(255),
  folder_link          VARCHAR(1000),
  description          TEXT,
  order_creation_type  UUID         REFERENCES shipment_creation_types(id) ON DELETE SET NULL,
  order_type           UUID         REFERENCES shipment_types(id) ON DELETE SET NULL,
  created_by           UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipment_statuses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id  UUID         NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status_id    UUID         NOT NULL REFERENCES statuses(id) ON DELETE RESTRICT,
  notes        TEXT,
  created_by   UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipment_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID        NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  comment     TEXT        NOT NULL,
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Periods ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS periods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  start_date  DATE         NOT NULL,
  end_date    DATE         NOT NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'open',
  notes       TEXT,
  created_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT periods_status_check CHECK (status IN ('open', 'closed')),
  CONSTRAINT periods_dates_check  CHECK (end_date > start_date)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_tenant          ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email           ON users(email);
CREATE INDEX IF NOT EXISTS idx_shipments_tenant      ON shipments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shipments_order       ON shipments(order_number);
CREATE INDEX IF NOT EXISTS idx_shipments_despatch    ON shipments(despatch_date);
CREATE INDEX IF NOT EXISTS idx_shipment_statuses_sid ON shipment_statuses(shipment_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant      ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant       ON bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_periods_tenant        ON periods(tenant_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash   ON refresh_tokens(token_hash);
