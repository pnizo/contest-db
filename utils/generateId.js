/**
 * ユニークなIDを生成する
 * フォーマット: YYYYMMDD-HHMMSS-RANDOM (例: 20250120-143025-A1B2)
 */
function generateUniqueId() {
  const now = new Date();

  // 日付部分: YYYYMMDD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePart = `${year}${month}${day}`;

  // 時刻部分: HHMMSS
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timePart = `${hours}${minutes}${seconds}`;

  // ランダム部分: 4文字の英数字
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomPart = '';
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `${datePart}-${timePart}-${randomPart}`;
}

module.exports = { generateUniqueId };
