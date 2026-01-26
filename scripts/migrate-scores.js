require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function migrateScores() {
  const sql = neon(process.env.DATABASE_URL);

  console.log('Creating scores table...');

  // scores テーブル作成
  await sql`
    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      fwj_card_no VARCHAR(50) NOT NULL,
      contest_date VARCHAR(20) NOT NULL,
      contest_name VARCHAR(255) NOT NULL,
      contest_place VARCHAR(255),
      category_name VARCHAR(255) NOT NULL,
      "placing" VARCHAR(20),
      player_no VARCHAR(50),
      player_name VARCHAR(255),
      is_valid BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP,
      restored_at TIMESTAMP
    )
  `;
  console.log('scores table created.');

  // インデックス作成
  console.log('Creating indexes...');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_scores_fwj_card_no ON scores(fwj_card_no)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_scores_contest_date ON scores(contest_date)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_scores_contest_name ON scores(contest_name)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_scores_category_name ON scores(category_name)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_scores_is_valid ON scores(is_valid)
  `;

  console.log('Indexes created.');

  // 確認
  const columns = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'scores'
    ORDER BY ordinal_position
  `;

  console.log('\n=== scores table columns ===');
  columns.forEach(col => {
    console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
  });

  console.log('\nMigration completed successfully!');
}

migrateScores().catch(console.error);
