import assert from 'node:assert/strict';

// Inspect each actual executable branch, rather than counting duplicate text in
// the two-path migration or treating retained historical helpers as live RPCs.
export function s5MigrationBranches(migration) {
  const branches = { fresh: [], existing: [] };
  const pattern = /DO \$pr63_if_(\d+)\$ BEGIN IF \(SELECT mode FROM pg_temp\._pr63_install_mode\)='(fresh|existing)' THEN EXECUTE \$pr63_stmt_\1\$([\s\S]*?)\$pr63_stmt_\1\$; END IF; END \$pr63_if_\1\$;/g;
  for (const match of migration.matchAll(pattern)) branches[match[2]].push(match[3]);
  for (const [name, statements] of Object.entries(branches)) {
    assert.ok(statements.length > 0, `${name} executable DDL branch must be present`);
  }
  return branches;
}

export function s5ActorDefinition(statements) {
  const definition = statements.find(statement => /^\s*CREATE(?: OR REPLACE)? FUNCTION "?ink_product"?\."?request_actor_v1"?\(\)/i.test(statement.replace(/^\s*--[^\n]*$/gm, '').trimStart()));
  assert.ok(definition, 'the live request_actor_v1 definition must be present');
  return definition;
}
