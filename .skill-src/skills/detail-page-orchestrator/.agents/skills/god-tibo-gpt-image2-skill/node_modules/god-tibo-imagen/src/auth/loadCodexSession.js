// @ts-nocheck
import fs from 'node:fs/promises';

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Load Codex auth/session state from the local files on disk.
 *
 * @param {{ authFile: string, installationIdFile: string }} options - File paths for the Codex auth and installation ID files.
 * @returns {Promise<{ authFile: string, authMode: string | null, lastRefresh: string | null, accessToken: string | null, accountId: string | null, idToken: string | null, refreshToken: string | null, installationId: string | null, raw: unknown }>}
 */
export async function loadCodexSession({ authFile, installationIdFile }) {
  const authRaw = await fs.readFile(authFile, 'utf8');
  const authJson = JSON.parse(authRaw);
  const tokens = authJson?.tokens ?? {};

  let installationId = null;
  try {
    installationId = normalizeString(await fs.readFile(installationIdFile, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  return {
    authFile,
    authMode: normalizeString(authJson?.auth_mode),
    lastRefresh: normalizeString(authJson?.last_refresh),
    accessToken: normalizeString(tokens?.access_token),
    accountId: normalizeString(tokens?.account_id),
    idToken: normalizeString(tokens?.id_token),
    refreshToken: normalizeString(tokens?.refresh_token),
    installationId,
    raw: authJson
  };
}
