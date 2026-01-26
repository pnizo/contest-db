require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function migrateNotes() {
  const sql = neon(process.env.DATABASE_URL);

  console.log('Creating notes table...');

  // notes テーブル作成
  await sql`
    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      contest_date VARCHAR(20) NOT NULL,
      contest_name VARCHAR(255) NOT NULL,
      name_ja VARCHAR(255) NOT NULL,
      type VARCHAR(100) NOT NULL,
      player_no VARCHAR(50),
      fwj_card_no VARCHAR(50),
      npc_member_no VARCHAR(50),
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(50),
      note VARCHAR(2000),
      is_valid BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP,
      restored_at TIMESTAMP
    )
  `;
  console.log('notes table created.');

  // インデックス作成
  console.log('Creating indexes...');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_notes_contest_name ON notes(contest_name)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_notes_contest_date ON notes(contest_date)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_notes_fwj_card_no ON notes(fwj_card_no)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_notes_is_valid ON notes(is_valid)
  `;

  console.log('Indexes created.');

  // 確認
  const columns = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'notes'
    ORDER BY ordinal_position
  `;

  console.log('\n=== notes table columns ===');
  columns.forEach(col => {
    console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
  });

  console.log('\nMigration completed successfully!');
}

migrateNotes().catch(console.error);
