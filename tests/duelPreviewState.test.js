import test from 'node:test';
import assert from 'node:assert/strict';
import { previewPanelFromState, mergePreviewPanel } from '../utils/duelPreview.js';
import { normalizeDuelPreviewState } from '../services/duelItemService.js';

const raw = {item_event_id:'event',source_page_id:'source',source_revision_id:'rev',source_valid:true,active:true,
  expires_at:'2026-10-14T10:00:15Z',server_now:'2026-10-14T10:00:00Z',used:1,reserved:1,max:3,
  candidates:[{page_id:'123',title:'alias',censored:false}],entries:[{page_id:'123',status:'ready',summary:{extract:'summary'}}]};
test('server counters, canonical keys and time conversion drive the preview panel',()=>{
  const state=normalizeDuelPreviewState(raw,1000);const panel=previewPanelFromState(state);
  assert.equal(panel.usedPreviews,1);assert.equal(panel.reservedPreviews,1);assert.equal(panel.expiresAt,Date.parse(raw.expires_at)-1000);
  assert.equal(panel.entries['123'].extract,'summary');assert.equal(panel.entries.alias,undefined);
});
test('closed/recovered panel never opens from state; another activation cannot overwrite it',()=>{
  const state=normalizeDuelPreviewState(raw);assert.equal(mergePreviewPanel(null,state),null);
  const panel=previewPanelFromState(state);assert.equal(mergePreviewPanel(panel,{...state,itemEventId:'other'}),panel);
});
test('movement and expiry close panel while stale state cannot overwrite newer state',()=>{
  const state=normalizeDuelPreviewState(raw);const panel=previewPanelFromState(state);
  assert.equal(mergePreviewPanel(panel,{...state,sourceValid:false,active:false}),null);
  assert.equal(mergePreviewPanel(panel,{...state,active:false,expired:true}),null);
  assert.equal(mergePreviewPanel(panel,{...state,serverNow:state.serverNow-1,used:0}),panel);
});
test('failed reservation remains retryable and never becomes a seen summary',()=>{
  const state=normalizeDuelPreviewState({...raw,used:0,reserved:0,entries:[{page_id:'123',status:'failed'}]});
  const panel=previewPanelFromState(state);assert.equal(panel.usedPreviews,0);assert.equal(panel.entries['123'].status,'unavailable');
});
