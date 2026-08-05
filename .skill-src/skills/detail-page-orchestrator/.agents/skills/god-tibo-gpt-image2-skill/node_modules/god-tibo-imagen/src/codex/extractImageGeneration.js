// @ts-nocheck
function normalizeSource(source) {
  if (Array.isArray(source)) {
    return { items: source, events: [] };
  }
  return {
    items: source?.items || [],
    events: source?.events || []
  };
}

/**
 * Extract the final image_generation_call output from parsed response items or SSE events.
 *
 * @param {Array<unknown> | { items?: Array<unknown>, events?: Array<unknown> }} source - Parsed response data.
 * @returns {{ callId: string | undefined, revisedPrompt: string | null, resultBase64: string, item: unknown }} Image generation result.
 */
export function extractImageGeneration(source) {
  const { items, events } = normalizeSource(source);

  const imageItem = [...items]
    .reverse()
    .find((item) => item?.type === 'image_generation_call' && item?.result);

  if (imageItem) {
    return {
      callId: imageItem.id,
      revisedPrompt: imageItem.revised_prompt ?? null,
      resultBase64: imageItem.result,
      item: imageItem
    };
  }

  const partialImageEvent = [...events]
    .reverse()
    .find((event) => event?.data?.type === 'response.image_generation_call.partial_image' && event?.data?.partial_image_b64);

  if (partialImageEvent) {
    return {
      callId: partialImageEvent.data.item_id,
      revisedPrompt: partialImageEvent.data.revised_prompt ?? null,
      resultBase64: partialImageEvent.data.partial_image_b64,
      item: {
        type: 'image_generation_call',
        id: partialImageEvent.data.item_id,
        status: 'completed',
        revised_prompt: partialImageEvent.data.revised_prompt ?? null,
        result: partialImageEvent.data.partial_image_b64
      }
    };
  }

  const error = new Error('The response stream completed without an image_generation_call result.');
  error.code = 'MISSING_IMAGE_GENERATION_OUTPUT';
  throw error;
}
