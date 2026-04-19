const MIXPANEL_TOKEN = "08d901b372bf2d1fc1e60e198a4272e8";

/**
 * Track an event from server-side code (webhooks, API routes).
 * Fire-and-forget — never throws, never blocks the response.
 */
export async function trackServerEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  try {
    const payload = [
      {
        event,
        properties: {
          token: MIXPANEL_TOKEN,
          distinct_id: distinctId,
          $insert_id: `${event}_${distinctId}_${Date.now()}`,
          time: Math.floor(Date.now() / 1000),
          ...properties,
        },
      },
    ];

    await fetch("https://api.mixpanel.com/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Non-blocking — never fail a request due to analytics
  }
}
