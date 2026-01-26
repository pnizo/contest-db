require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function migrateRegistrations() {
  const sql = neon(process.env.DATABASE_URL);

  console.log('Creating registrations table...');

  // registrations テーブル作成
  await sql`
    CREATE TABLE IF NOT EXISTS registrations (
      id SERIAL PRIMARY KEY,
      contest_date VARCHAR(20) NOT NULL,
      contest_name VARCHAR(255) NOT NULL,
      player_no VARCHAR(50),
      name_ja VARCHAR(255),
      name_ja_kana VARCHAR(255),
      fwj_card_no VARCHAR(50),
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(50),
      country VARCHAR(100),
      age VARCHAR(10),
      class_name VARCHAR(255),
      sort_index VARCHAR(50),
      score_card VARCHAR(50),
      contest_order VARCHAR(50),
      height VARCHAR(20),
      weight VARCHAR(20),
      occupation VARCHAR(255),
      instagram VARCHAR(255),
      biography VARCHAR(2000),
      is_valid BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP,
      restored_at TIMESTAMP
    )
  `;
  console.log('registrations table created.');

  // インデックス作成
  console.log('Creating indexes...');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_registrations_contest_date ON registrations(contest_date)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_registrations_contest_name ON registrations(contest_name)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_registrations_fwj_card_no ON registrations(fwj_card_no)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_registrations_class_name ON registrations(class_name)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_registrations_is_valid ON registrations(is_valid)
  `;

  console.log('Indexes created.');

  // 確認
  const columns = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'registrations'
    ORDER BY ordinal_position
  `;

  console.log('\n=== registrations table columns ===');
  columns.forEach(col => {
    console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
  });

  console.log('\nMigration completed successfully!');
}

migrateRegistrations().catch(console.error);
