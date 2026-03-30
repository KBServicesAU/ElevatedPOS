-- OAuth 2.0 tables

CREATE TABLE IF NOT EXISTS "oauth_clients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid REFERENCES "organisations"("id") ON DELETE CASCADE,
  "client_id" text NOT NULL UNIQUE,
  "client_secret" text NOT NULL,
  "name" text NOT NULL,
  "redirect_uris" jsonb NOT NULL DEFAULT '[]',
  "scopes" jsonb NOT NULL DEFAULT '[]',
  "is_confidential" boolean NOT NULL DEFAULT true,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oauth_clients_org_id ON "oauth_clients"("org_id");
CREATE INDEX idx_oauth_clients_client_id ON "oauth_clients"("client_id");
CREATE INDEX idx_oauth_clients_is_active ON "oauth_clients"("is_active");

CREATE TABLE IF NOT EXISTS "oauth_auth_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" uuid NOT NULL REFERENCES "oauth_clients"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "scopes" jsonb NOT NULL DEFAULT '[]',
  "code" text NOT NULL UNIQUE,
  "redirect_uri" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oauth_auth_codes_client_id ON "oauth_auth_codes"("client_id");
CREATE INDEX idx_oauth_auth_codes_code ON "oauth_auth_codes"("code");
CREATE INDEX idx_oauth_auth_codes_user_id ON "oauth_auth_codes"("user_id");

CREATE TABLE IF NOT EXISTS "oauth_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" uuid NOT NULL REFERENCES "oauth_clients"("id") ON DELETE CASCADE,
  "user_id" uuid,
  "org_id" uuid NOT NULL,
  "access_token" text NOT NULL UNIQUE,
  "refresh_token" text UNIQUE,
  "scopes" jsonb NOT NULL DEFAULT '[]',
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oauth_tokens_client_id ON "oauth_tokens"("client_id");
CREATE INDEX idx_oauth_tokens_access_token ON "oauth_tokens"("access_token");
CREATE INDEX idx_oauth_tokens_refresh_token ON "oauth_tokens"("refresh_token");
CREATE INDEX idx_oauth_tokens_user_id ON "oauth_tokens"("user_id");
CREATE INDEX idx_oauth_tokens_org_id ON "oauth_tokens"("org_id");
