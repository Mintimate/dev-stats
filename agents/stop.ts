import { jsonResponse } from './_shared';

export async function onRequest(context: any) {
  const conversationId = context.request?.body?.conversation_id as string | undefined;
  if (!conversationId) {
    return jsonResponse({ error: 'Missing conversation_id' }, 400);
  }

  const result = context.utils?.abortActiveRun?.(conversationId);
  return jsonResponse({
    status: result?.aborted ? 'aborting' : 'idle',
    conversation_id: conversationId,
    ...(result ?? {}),
  });
}
