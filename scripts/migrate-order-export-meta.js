require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function migrateOrderExportMeta() {
  const sql = neon(process.env.DATABASE_URL);

  console.log('Creating order_export_meta table...');

  // order_export_meta テーブル作成
  await sql`
    CREATE TABLE IF NOT EXISTS order_export_meta (
      id SERIAL PRIMARY KEY,
      search_tags VARCHAR(1000),
      paid_only BOOLEAN DEFAULT TRUE,
      exported_at TIMESTAMP DEFAULT NOW(),
      order_count INTEGER DEFAULT 0,
      row_count INTEGER DEFAULT 0
    )
  `;
  console.log('order_export_meta table created.');

  // 確認
  const columns = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'order_export_meta'
    ORDER BY ordinal_position
  `;

  console.log('\n=== order_export_meta table columns ===');
  columns.forEach(col => {
    console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
  });

  console.log('\nMigration completed successfully!');
}

migrateOrderExportMeta().catch(console.error);
