/**
 * Extract the final image_generation_call output from parsed response items or SSE events.
 *
 * @param {Array<unknown> | { items?: Array<unknown>, events?: Array<unknown> }} source - Parsed response data.
 * @returns {{ callId: string | undefined, revisedPrompt: string | null, resultBase64: string, item: unknown }} Image generation result.
 */
export function extractImageGeneration(source: Array<unknown> | {
    items?: Array<unknown>;
    events?: Array<unknown>;
}): {
    callId: string | undefined;
    revisedPrompt: string | null;
    resultBase64: string;
    item: unknown;
};
