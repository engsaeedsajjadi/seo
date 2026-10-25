import {PGlite} from '@electric-sql/pglite';
import {uuid_ossp} from '@electric-sql/pglite/contrib/uuid_ossp';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFileSync,readdirSync} from 'node:fs';
const db=new PGlite({extensions:{uuid_ossp,pgcrypto}});
try {
  await db.exec(readFileSync('apps/api/db/schema.sql','utf8'));
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(`drizzle/${file}`,'utf8'));
  await db.exec(readFileSync('tests/security/rls-postgres.sql','utf8'));
  console.log('PASS: actual PostgreSQL RLS policies under a non-owner role (read/update/delete/insert/empty context)');
}finally{await db.close();}
