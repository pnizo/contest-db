/**
 * マイグレーション: order_tags テーブルのデータを orders テーブルの tag1-tag10 カラムに移行し、
 * order_tags テーブルを削除する。
 *
 * 使用方法: node scripts/migrate-order-tags-to-columns.js
 */
require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  // 1. orders テーブルに tag1-tag10 カラムを追加
  console.log('Adding tag1-tag10 columns to orders table...');
  for (let i = 1; i <= 10; i++) {
    await sql(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tag${i} varchar(255)`);
    console.log(`  tag${i} added`);
  }

  // 2. order_tags テーブルが存在するか確認
  const tableCheck = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = 'order_tags'
    ) AS exists
  `;

  if (tableCheck[0].exists) {
    // 3. order_tags からデータを読み取り、sort_order 順で各注文の tag1-tag10 に書き込み
    console.log('Migrating tags from order_tags to orders columns...');
    const tagRows = await sql`
      SELECT order_id, tag, sort_order
      FROM order_tags
      ORDER BY order_id, sort_order
    `;

    // 注文IDごとにタグをグループ化
    const tagsByOrder = new Map();
    for (const row of tagRows) {
      if (!tagsByOrder.has(row.order_id)) {
        tagsByOrder.set(row.order_id, []);
      }
      tagsByOrder.get(row.order_id).push(row.tag);
    }

    let migrated = 0;
    for (const [orderId, tags] of tagsByOrder) {
      // 上限10個に切り捨て
      const limited = tags.slice(0, 10);
      const updates = {};
      for (let i = 0; i < 10; i++) {
        updates[`tag${i + 1}`] = limited[i] || null;
      }

      await sql`
        UPDATE orders SET
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
        WHERE id = ${orderId}
      `;
      migrated++;
    }

    console.log(`  Migrated tags for ${migrated} orders`);

    // 4. order_tags テーブルを削除
    console.log('Dropping order_tags table...');
    await sql`DROP TABLE IF EXISTS order_tags`;
    console.log('  order_tags table dropped');
  } else {
    console.log('order_tags table does not exist, skipping data migration');
  }

  console.log('Migration completed successfully');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
