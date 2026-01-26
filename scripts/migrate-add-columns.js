require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);
  
  console.log('Adding missing columns...\n');
  
  // ticketsテーブルの不足カラム
  console.log('=== tickets table ===');
  const ticketAlterStatements = [
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS total_price VARCHAR(20) NOT NULL DEFAULT '0'`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS financial_status VARCHAR(50) NOT NULL DEFAULT ''`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(50) NOT NULL DEFAULT ''`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS line_item_id VARCHAR(50) NOT NULL DEFAULT ''`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS item_sub_no INTEGER NOT NULL DEFAULT 0`,
  ];
  
  for (const stmt of ticketAlterStatements) {
    try {
      await sql(stmt);
      console.log(`✓ ${stmt.split('ADD COLUMN IF NOT EXISTS ')[1].split(' ')[0]}`);
    } catch (error) {
      console.error(`✗ Error: ${error.message}`);
    }
  }
  
  // contestsテーブルの不足カラム
  console.log('\n=== contests table ===');
  const contestAlterStatements = [
    `ALTER TABLE contests ADD COLUMN IF NOT EXISTS contest_place VARCHAR(255) NOT NULL DEFAULT ''`,
  ];
  
  for (const stmt of contestAlterStatements) {
    try {
      await sql(stmt);
      console.log(`✓ ${stmt.split('ADD COLUMN IF NOT EXISTS ')[1].split(' ')[0]}`);
    } catch (error) {
      console.error(`✗ Error: ${error.message}`);
    }
  }
  
  console.log('\nMigration complete!');
}

migrate().catch(console.error);
