/**
 * マイグレーション: ticket_tags テーブルのデータを tickets テーブルの tag1-tag10 カラムに移行し、
 * ticket_tags テーブルを削除する。
 *
 * 使用方法: node scripts/migrate-ticket-tags-to-columns.js
 */
require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  // 1. tickets テーブルに tag1-tag10 カラムを追加
  console.log('Adding tag1-tag10 columns to tickets table...');
  for (let i = 1; i <= 10; i++) {
    await sql(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS tag${i} varchar(255)`);
    console.log(`  tag${i} added`);
  }

  // 2. ticket_tags テーブルが存在するか確認
  const tableCheck = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = 'ticket_tags'
    ) AS exists
  `;

  if (tableCheck[0].exists) {
    // 3. ticket_tags からデータを読み取り、sort_order 順で各チケットの tag1-tag10 に書き込み
    console.log('Migrating tags from ticket_tags to tickets columns...');
    const tagRows = await sql`
      SELECT ticket_id, tag, sort_order
      FROM ticket_tags
      ORDER BY ticket_id, sort_order
    `;

    // チケットIDごとにタグをグループ化
    const tagsByTicket = new Map();
    for (const row of tagRows) {
      if (!tagsByTicket.has(row.ticket_id)) {
        tagsByTicket.set(row.ticket_id, []);
      }
      tagsByTicket.get(row.ticket_id).push(row.tag);
    }

    let migrated = 0;
    for (const [ticketId, tags] of tagsByTicket) {
      // 上限10個に切り捨て
      const limited = tags.slice(0, 10);
      const updates = {};
      for (let i = 0; i < 10; i++) {
        updates[`tag${i + 1}`] = limited[i] || null;
      }

      await sql`
        UPDATE tickets SET
          tag1 = ${updates.tag1},
          tag2 = ${updates.tag2},
          tag3 = ${updates.tag3},
          tag4 = ${updates.tag4},
          tag5 = ${updates.tag5},
          tag6 = ${updates.tag6},
          tag7 = ${updates.tag7},
          tag8 = ${updates.tag8},
          tag9 = ${updates.tag9},
          tag10 = ${updates.tag10}
        WHERE id = ${ticketId}
      `;
      migrated++;
    }

    console.log(`  Migrated tags for ${migrated} tickets`);

    // 4. ticket_tags テーブルを削除
    console.log('Dropping ticket_tags table...');
    await sql`DROP TABLE IF EXISTS ticket_tags`;
    console.log('  ticket_tags table dropped');
  } else {
    console.log('ticket_tags table does not exist, skipping data migration');
  }

  console.log('Migration completed successfully');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
