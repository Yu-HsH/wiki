#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../data/research/daily-goal-cached-reachable-pairs-20261109.json',import.meta.url),'utf8'));
if(data.pairCount!==829||data.pairs.length!==829||new Set(data.pairs.map(x=>x.source+'\u0000'+x.goal)).size!==829){
 throw new Error('EVIDENCE_FROZEN_PAIR_COUNT_MISMATCH');
}
const esc=s=>"'"+s.replaceAll("'","''")+"'";
const values=data.pairs.map(x=>'('+esc(x.source)+','+esc(x.goal)+')').join(',\n');
writeFileSync('/tmp/daily-v2-real-pairs.sql',
  'begin;\ntruncate public.daily_course_pairs_v2;\n'+
  'insert into public.daily_course_pairs_v2(start_title,target_title) values\n'+values+';\ncommit;\n');
console.log('DAILY_GOAL_V2_FROZEN_GRAPH_FIXTURE '+JSON.stringify({
 pairs:data.pairCount,sources:data.sourceCount,goals:data.goalCount
}));
