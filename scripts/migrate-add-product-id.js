require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log('Adding product_id column to tickets and orders tables...\n');

  // tickets テーブル
  console.log('=== tickets table ===');
  try {
    await sql(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS product_id VARCHAR(50) NOT NULL DEFAULT ''`);
    console.log(`✓ product_id`);
  } catch (error) {
    console.error(`✗ Error: ${error.message}`);
  }

  // orders テーブル
  console.log('\n=== orders table ===');
  try {
    await sql(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_id VARCHAR(50) DEFAULT ''`);
    console.log(`✓ product_id`);
  } catch (error) {
    console.error(`✗ Error: ${error.message}`);
  }

  console.log('\nMigration complete!');
}

migrate().catch(console.error);
