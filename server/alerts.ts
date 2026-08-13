import { notifyOwner } from "./_core/notification";
import { ENV } from "./_core/env";
import { updateNotificationDelivery } from "./db";

async function postWebhook(title: string, body: string) {
  if (!ENV.ownerWebhookUrl) return false;
  try {
    const response = await fetch(ENV.ownerWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, body, source: "tmt-trading-dashboard" }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function dispatchOwnerAlert(notification: { id: number; title: string; body: string }) {
  let delivered = false;
  let deliveryError: string | undefined;
  try {
    delivered = await notifyOwner({ title: notification.title, content: notification.body });
    if (!delivered) deliveryError = "Project-owner notification service did not accept the alert.";
  } catch (error) {
    deliveryError = error instanceof Error ? error.message : String(error);
  }
  if (!delivered) {
    delivered = await postWebhook(notification.title, notification.body);
    if (delivered) deliveryError = undefined;
  }
  await updateNotificationDelivery(notification.id, delivered ? "sent" : "failed", deliveryError);
  return delivered;
}
