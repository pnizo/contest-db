require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function migrateOrders() {
  const sql = neon(process.env.DATABASE_URL);

  console.log('Creating orders table...');

  // orders テーブル作成
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_no VARCHAR(50) NOT NULL,
      order_date VARCHAR(30),
      shopify_id VARCHAR(50),
      full_name VARCHAR(255),
      email VARCHAR(255),
      total_price VARCHAR(20),
      financial_status VARCHAR(50),
      fulfillment_status VARCHAR(50),
      product_name VARCHAR(500),
      variant VARCHAR(255),
      quantity INTEGER DEFAULT 0,
      current_quantity INTEGER DEFAULT 0,
      price VARCHAR(20),
      line_item_id VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('orders table created.');

  // インデックス作成
  console.log('Creating indexes for orders...');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_orders_shopify_id ON orders(shopify_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_orders_line_item_id ON orders(line_item_id)
  `;

  console.log('Orders indexes created.');

  // order_tags テーブル作成
  console.log('Creating order_tags table...');

  await sql`
    CREATE TABLE IF NOT EXISTS order_tags (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      tag VARCHAR(255) NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `;
  console.log('order_tags table created.');

  // order_tags インデックス作成
  console.log('Creating indexes for order_tags...');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_order_tags_order_id ON order_tags(order_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_order_tags_tag ON order_tags(tag)
  `;

  console.log('Order_tags indexes created.');

  // 確認
  const ordersColumns = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'orders'
    ORDER BY ordinal_position
  `;

  console.log('\n=== orders table columns ===');
  ordersColumns.forEach(col => {
    console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
  });

  const orderTagsColumns = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'order_tags'
    ORDER BY ordinal_position
  `;

  console.log('\n=== order_tags table columns ===');
  orderTagsColumns.forEach(col => {
    console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
  });

  console.log('\nMigration completed successfully!');
}

migrateOrders().catch(console.error);
