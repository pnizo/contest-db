require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function checkSchema() {
  const sql = neon(process.env.DATABASE_URL);
  
  // ticketsテーブルのカラム一覧を取得
  const columns = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'tickets'
    ORDER BY ordinal_position
  `;
  
  console.log('=== tickets table columns ===');
  columns.forEach(col => {
    console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
  });
  
  // ticket_tagsテーブルの確認
  const tagColumns = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'ticket_tags'
    ORDER BY ordinal_position
  `;
  
  if (tagColumns.length > 0) {
    console.log('\n=== ticket_tags table columns ===');
    tagColumns.forEach(col => {
      console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
  } else {
    console.log('\n=== ticket_tags table does not exist ===');
  }
  
  // contestsテーブルの確認
  const contestColumns = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'contests'
    ORDER BY ordinal_position
  `;
  
  if (contestColumns.length > 0) {
    console.log('\n=== contests table columns ===');
    contestColumns.forEach(col => {
      console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
  } else {
    console.log('\n=== contests table does not exist ===');
  }
}

checkSchema().catch(console.error);
