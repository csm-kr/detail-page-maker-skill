/**
 * Create the configured provider implementation.
 *
 * @param {{ provider: string, baseUrl?: string, authFile?: string, installationIdFile?: string, generatedImagesDir?: string, defaultOriginator?: string }} config - Resolved runtime configuration.
 * @returns {{ generateImage: (args: unknown) => Promise<unknown> }} Provider with a generateImage method.
 */
export function createProvider(config: {
    provider: string;
    baseUrl?: string;
    authFile?: string;
    installationIdFile?: string;
    generatedImagesDir?: string;
    defaultOriginator?: string;
}): {
    generateImage: (args: unknown) => Promise<unknown>;
};
