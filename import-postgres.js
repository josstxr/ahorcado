const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const sourceConnectionString = process.env.SOURCE_DATABASE_URL || process.env.LOCAL_DATABASE_URL;
const targetConnectionString = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
const shouldTruncate = process.env.IMPORT_TRUNCATE === 'true';

if (!sourceConnectionString) {
  console.error('Error: configura SOURCE_DATABASE_URL o LOCAL_DATABASE_URL con el PostgreSQL origen.');
  process.exit(1);
}

if (!targetConnectionString) {
  console.error('Error: configura TARGET_DATABASE_URL, DATABASE_URL o PG_CONNECTION_STRING con Supabase destino.');
  process.exit(1);
}

const sourcePool = new Pool({
  connectionString: sourceConnectionString,
  ssl: sourceConnectionString.includes('supabase') || sourceConnectionString.includes('pooler.supabase') ? { rejectUnauthorized: false } : false,
});

const targetPool = new Pool({
  connectionString: targetConnectionString,
  ssl: targetConnectionString.includes('supabase') || targetConnectionString.includes('pooler.supabase') ? { rejectUnauthorized: false } : false,
});

const tables = [
  'players',
  'words',
  'daily_words',
  'daily_word_answers',
  'assigned_games',
  'games',
];

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function tableColumns(client, tableName) {
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );
  return result.rows.map((row) => row.column_name);
}

async function tableExists(client, tableName) {
  const result = await client.query(`SELECT to_regclass($1) AS table_name`, [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
}

async function copyTable(sourceClient, targetClient, tableName) {
  const [sourceExists, targetExists] = await Promise.all([
    tableExists(sourceClient, tableName),
    tableExists(targetClient, tableName),
  ]);
  if (!sourceExists || !targetExists) {
    console.log(`- ${tableName}: omitida porque no existe en origen o destino.`);
    return;
  }

  const sourceColumns = await tableColumns(sourceClient, tableName);
  const targetColumns = await tableColumns(targetClient, tableName);
  const columns = sourceColumns.filter((column) => targetColumns.includes(column));
  if (!columns.includes('id')) {
    console.log(`- ${tableName}: omitida porque no tiene columna id.`);
    return;
  }

  const sourceRows = await sourceClient.query(
    `SELECT ${columns.map(quoteIdentifier).join(', ')} FROM ${quoteIdentifier(tableName)} ORDER BY id`
  );
  if (!sourceRows.rows.length) {
    console.log(`- ${tableName}: 0 registros.`);
    return;
  }

  const quotedColumns = columns.map(quoteIdentifier).join(', ');
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const updateColumns = columns.filter((column) => column !== 'id');
  const updateSql = updateColumns.length
    ? `DO UPDATE SET ${updateColumns.map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`).join(', ')}`
    : 'DO NOTHING';
  const sql = `INSERT INTO ${quoteIdentifier(tableName)} (${quotedColumns}) VALUES (${placeholders}) ON CONFLICT (id) ${updateSql}`;

  for (const row of sourceRows.rows) {
    await targetClient.query(sql, columns.map((column) => row[column]));
  }

  await targetClient.query(
    `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${quoteIdentifier(tableName)}), 1), true)`,
    [tableName]
  );
  console.log(`- ${tableName}: ${sourceRows.rows.length} registros importados/actualizados.`);
}

async function main() {
  const sourceClient = await sourcePool.connect();
  const targetClient = await targetPool.connect();

  try {
    await targetClient.query('BEGIN');
    if (shouldTruncate) {
      await targetClient.query(`TRUNCATE ${tables.map(quoteIdentifier).join(', ')} RESTART IDENTITY CASCADE`);
      console.log('Destino vaciado porque IMPORT_TRUNCATE=true.');
    }

    for (const table of tables) {
      await copyTable(sourceClient, targetClient, table);
    }

    await targetClient.query('COMMIT');
    console.log('Importación completada.');
  } catch (err) {
    await targetClient.query('ROLLBACK');
    console.error('Error durante la importación:', err.message);
    process.exitCode = 1;
  } finally {
    sourceClient.release();
    targetClient.release();
    await sourcePool.end();
    await targetPool.end();
  }
}

main();
