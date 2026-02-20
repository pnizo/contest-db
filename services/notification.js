require('dotenv').config();
const { getDb } = require('../lib/db');
const { pushSubscriptions } = require('../lib/db/schema');
const { eq } = require('drizzle-orm');

/**
 * shopifyId に対応するプッシュ通知サブスクリプションが存在するか確認
 * @param {string} shopifyId
 * @returns {Promise<boolean>}
 */
async function hasPushSubscription(shopifyId) {
  const db = getDb();
  const rows = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.shopifyId, shopifyId))
    .limit(1);
  return rows.length > 0;
}

/**
 * プッシュ通知を送信
 * @param {{ shopifyId: string, title: string, body: string, url?: string }} params
 * @returns {Promise<{ ok: boolean, status: number, data: any }>}
 */
async function sendPushNotification({ shopifyId, title, body, url }) {
  const baseUrl = process.env.FITNESS_APP_URL;
  const adminSecret = process.env.FITNESS_APP_API_SECRET;

  if (!baseUrl || !adminSecret) {
    throw new Error('通知サービスが設定されていません');
  }

  const payload = { shopifyId, title, body };
  if (url) payload.url = url;

  const response = await fetch(`${baseUrl}/api/notifications/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminSecret}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

module.exports = { hasPushSubscription, sendPushNotification };
