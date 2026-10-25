-- Legacy JWTs are intentionally invalidated: every new access token has a session id.
CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE TABLE auth_refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  consumed_at TIMESTAMPTZ
);
CREATE INDEX auth_refresh_session ON auth_refresh_tokens(session_id);

CREATE UNIQUE INDEX projects_org_id_unique ON projects(organization_id, id);
CREATE TABLE client_projects (
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,
  PRIMARY KEY (organization_id, user_id, project_id),
  FOREIGN KEY (organization_id, user_id) REFERENCES organization_members(organization_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id) ON DELETE CASCADE
);
ALTER TABLE client_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON client_projects FOR ALL
USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
