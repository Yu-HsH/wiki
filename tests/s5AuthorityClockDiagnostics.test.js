import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {s5MigrationBranches} from './helpers/s5MigrationSource.js';

const source=fs.readFileSync(new URL('../supabase/migrations/20261120024414_group_items_s5.sql',import.meta.url),'utf8');
const expected=['ink_s4_dispatch_v1_grant','ink_s4_dispatch_v1_legacy','ink_s5_phase1_auto_dispatch_v1'];
test('S5: all authority-time rejection paths retain strict checks and rollback-safe diagnostics',()=>{
 for(const [branchName,statements] of Object.entries(s5MigrationBranches(source))){
  const source=statements.join(';\n');
  const branches=[...source.matchAll(/IF NOT pg_catalog\.isfinite\(v_now\) OR EXISTS \(\s*SELECT 1 FROM ink_product_engine\.ink_receipts_v1 WHERE session_id=p_session AND authority_received_at>v_now\s*\) THEN([\s\S]*?)END IF;/g)];
  assert.equal(branches.length,3,`${branchName} retains all three strict clock guards`);
  const covered=new Set();
  for(const branch of branches){
    const body=branch[1];
    assert.match(body,/RAISE LOG 'S5_AUTHORITY_TIME_REGRESSION/);
    const name=expected.find(name=>body.includes("'"+name+"'"));
    assert.ok(name,`${branchName} diagnostic identifies an expected dispatcher`);covered.add(name);
    assert.ok(body.includes("pg_catalog.txid_current_if_assigned()"));
    assert.ok(body.includes("pg_catalog.pg_backend_pid()"));
    assert.ok(body.includes("last_receipt_at=%"));
    assert.ok(body.includes("pg_catalog.clock_timestamp()"));
    assert.ok(body.includes("pg_catalog.statement_timestamp()"));
    assert.match(body,/RETURN pg_catalog\.jsonb_build_object\('ok',false,'code','AUTHORITY_TIME_REGRESSION'\)/);
    assert.ok(body.indexOf('RAISE LOG')<body.indexOf('RETURN pg_catalog.jsonb_build_object'));
    assert.ok(!/p_payload\b|p_actor\b/.test(body),'do not log player identity or payload');
  }
  assert.equal(covered.size,expected.length,`${branchName} checks each dispatcher, without duplicates`);
 }
});
