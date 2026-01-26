require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function migrateMembers() {
  const sql = neon(process.env.DATABASE_URL);

  console.log('Creating members table...');

  // members テーブル作成
  await sql`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      shopify_id VARCHAR(50) NOT NULL,
      email VARCHAR(255) NOT NULL,
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      phone VARCHAR(50),
      tags VARCHAR(1000),
      address1 VARCHAR(500),
      address2 VARCHAR(500),
      city VARCHAR(255),
      province VARCHAR(255),
      zip VARCHAR(20),
      country VARCHAR(100),
      fwj_effectivedate VARCHAR(20),
      fwj_birthday VARCHAR(20),
      fwj_card_no VARCHAR(50),
      fwj_nationality VARCHAR(100),
      fwj_sex VARCHAR(20),
      fwj_firstname VARCHAR(255),
      fwj_lastname VARCHAR(255),
      fwj_kanafirstname VARCHAR(255),
      fwj_kanalastname VARCHAR(255),
      fwj_height VARCHAR(20),
      fwj_weight VARCHAR(20),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('members table created.');

  // インデックス作成
  console.log('Creating indexes...');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_members_shopify_id ON members(shopify_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_members_email ON members(email)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_members_fwj_card_no ON members(fwj_card_no)
  `;

  console.log('Indexes created.');

  // ユニーク制約追加（shopify_idで重複を防ぐ）
  console.log('Adding unique constraint on shopify_id...');
  try {
    await sql`
      ALTER TABLE members ADD CONSTRAINT members_shopify_id_unique UNIQUE (shopify_id)
    `;
    console.log('Unique constraint added.');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('Unique constraint already exists.');
    } else {
      throw err;
    }
  }

  // 確認
  const columns = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'members'
    ORDER BY ordinal_position
  `;

  console.log('\n=== members table columns ===');
  columns.forEach(col => {
    console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
  });

  console.log('\nMigration completed successfully!');
}

migrateMembers().catch(console.error);
