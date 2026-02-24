require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log('Adding score_j6 and score_j7 columns to judges table...\n');

  const alterStatements = [
    `ALTER TABLE judges ADD COLUMN IF NOT EXISTS score_j6 INTEGER`,
    `ALTER TABLE judges ADD COLUMN IF NOT EXISTS score_j7 INTEGER`,
  ];

  for (const stmt of alterStatements) {
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
