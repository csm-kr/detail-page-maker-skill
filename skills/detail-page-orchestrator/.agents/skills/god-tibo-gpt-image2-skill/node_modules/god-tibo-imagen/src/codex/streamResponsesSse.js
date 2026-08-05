// @ts-nocheck
function parseEventBlock(block) {
  const lines = block.split(/\r?\n/);
  let event = 'message';
  const dataLines = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue;
    }

    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  const dataText = dataLines.join('\n');
  let data = null;
  if (dataText) {
    try {
      data = JSON.parse(dataText);
    } catch (error) {
      const parseError = new Error(`Malformed SSE JSON payload for event ${event}: ${error.message}`);
      parseError.code = 'MALFORMED_SSE_JSON';
      parseError.event = event;
      parseError.payload = dataText;
      throw parseError;
    }
  }

  return { event, data, raw: block };
}

export function parseSseText(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  const chunks = normalized.split(/\n\n+/).map((value) => value.trim()).filter(Boolean);
  const events = chunks.map(parseEventBlock);
  return summarizeEvents(events);
}

/**
 * Summarize already-parsed SSE events.
 *
 * @param {Array<{ event?: string, data?: { type?: string, response?: { id?: string }, item?: unknown } }>} events - Parsed SSE events.
 * @returns {{ events: Array<{ event?: string, data?: { type?: string } }>, items: unknown[], responseId: string | null }} Event summary.
 */
export function summarizeEvents(events) {
  const items = [];
  let responseId = null;

  for (const event of events) {
    const type = event?.data?.type;
    if (type === 'response.created') {
      responseId = event.data?.response?.id ?? responseId;
    }
    if (type === 'response.output_item.done' && event.data?.item) {
      items.push(event.data.item);
    }
    if (type === 'response.completed') {
      responseId = event.data?.response?.id ?? responseId;
    }
  }

  return { events, items, responseId };
}
