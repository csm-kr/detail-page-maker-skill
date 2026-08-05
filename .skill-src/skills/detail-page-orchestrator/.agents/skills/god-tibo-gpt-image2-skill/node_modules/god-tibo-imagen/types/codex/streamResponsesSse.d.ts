export function parseSseText(text: any): {
    events: Array<{
        event?: string;
        data?: {
            type?: string;
        };
    }>;
    items: unknown[];
    responseId: string | null;
};
/**
 * Summarize already-parsed SSE events.
 *
 * @param {Array<{ event?: string, data?: { type?: string, response?: { id?: string }, item?: unknown } }>} events - Parsed SSE events.
 * @returns {{ events: Array<{ event?: string, data?: { type?: string } }>, items: unknown[], responseId: string | null }} Event summary.
 */
export function summarizeEvents(events: Array<{
    event?: string;
    data?: {
        type?: string;
        response?: {
            id?: string;
        };
        item?: unknown;
    };
}>): {
    events: Array<{
        event?: string;
        data?: {
            type?: string;
        };
    }>;
    items: unknown[];
    responseId: string | null;
};
