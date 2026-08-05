// @ts-nocheck
function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padLength = (4 - (payload.length % 4 || 4)) % 4;
    const padded = payload + '='.repeat(padLength);
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Validate the minimum session fields required to call the private Codex backend.
 *
 * @param {{ authMode?: string | null, accessToken?: string | null, accountId?: string | null, installationId?: string | null }} session - Loaded Codex session data.
 * @returns {{ warnings: string[] }} Validation warnings for optional or suspicious fields.
 */
export function validateCodexSession(session) {
  const issues = [];
  const warnings = [];

  if (!session) {
    issues.push('Missing session object.');
  }

  if (session?.authMode && session.authMode !== 'chatgpt') {
    warnings.push(`auth_mode is ${session.authMode}; expected chatgpt for the private backend path.`);
  }

  if (!session?.accessToken) {
    issues.push('Missing tokens.access_token in Codex auth state.');
  }

  if (!session?.accountId) {
    issues.push('Missing tokens.account_id in Codex auth state.');
  }

  if (!session?.installationId) {
    warnings.push('Missing ~/.codex/installation_id; requests will omit x-codex-installation-id client metadata.');
  }

  const accessPayload = decodeJwtPayload(session?.accessToken);
  if (accessPayload?.exp) {
    const expiresAt = new Date(accessPayload.exp * 1000);
    if (Number.isFinite(expiresAt.getTime())) {
      if (expiresAt.getTime() <= Date.now()) {
        warnings.push(`access token appears expired at ${expiresAt.toISOString()}.`);
      }
    }
  }

  if (issues.length > 0) {
    const error = new Error(`Invalid Codex session: ${issues.join(' ')}`);
    error.code = 'INVALID_CODEX_SESSION';
    error.issues = issues;
    error.warnings = warnings;
    throw error;
  }

  return { warnings };
}
