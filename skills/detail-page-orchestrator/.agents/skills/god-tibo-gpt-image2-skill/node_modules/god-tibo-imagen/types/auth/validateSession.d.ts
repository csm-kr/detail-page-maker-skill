/**
 * Validate the minimum session fields required to call the private Codex backend.
 *
 * @param {{ authMode?: string | null, accessToken?: string | null, accountId?: string | null, installationId?: string | null }} session - Loaded Codex session data.
 * @returns {{ warnings: string[] }} Validation warnings for optional or suspicious fields.
 */
export function validateCodexSession(session: {
    authMode?: string | null;
    accessToken?: string | null;
    accountId?: string | null;
    installationId?: string | null;
}): {
    warnings: string[];
};
