require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function migrateSubjects() {
  const sql = neon(process.env.DATABASE_URL);

  console.log('Creating subjects table...');

  // subjects テーブル作成
  await sql`
    CREATE TABLE IF NOT EXISTS subjects (
      id SERIAL PRIMARY KEY,
      fwj_card_no VARCHAR(50) NOT NULL,
      name_ja VARCHAR(255) NOT NULL,
      first_name VARCHAR(255) NOT NULL,
      last_name VARCHAR(255) NOT NULL,
      npc_member_no VARCHAR(50),
      note VARCHAR(1000),
      is_valid BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP,
      restored_at TIMESTAMP
    )
  `;
  console.log('subjects table created.');

  // インデックス作成
  console.log('Creating indexes...');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_subjects_fwj_card_no ON subjects(fwj_card_no)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_subjects_name_ja ON subjects(name_ja)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_subjects_is_valid ON subjects(is_valid)
  `;

  console.log('Indexes created.');

  // 確認
  const columns = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'subjects'
    ORDER BY ordinal_position
  `;

  console.log('\n=== subjects table columns ===');
  columns.forEach(col => {
    console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
  });

  console.log('\nMigration completed successfully!');
}

migrateSubjects().catch(console.error);
