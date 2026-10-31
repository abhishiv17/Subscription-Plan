/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lineAmounts, allowedTransitions, linesEditable } = require('../src/lib/subscriptions.ts');
test('line preview rounds subtotal and line tax to cents',()=>{assert.deepEqual(lineAmounts(3,100.05,18),{subtotal:300.15,tax:54.03,total:354.18});assert.deepEqual(lineAmounts(2,125,18),{subtotal:250,tax:45,total:295});assert.deepEqual(lineAmounts(1,0,18),{subtotal:0,tax:0,total:0});assert.deepEqual(lineAmounts(3.5,2.87,18),{subtotal:10.05,tax:1.81,total:11.86});assert.deepEqual(lineAmounts(0.5,0.01,0),{subtotal:0.01,tax:0,total:0.01});});
test('only draft and quotation lines are editable',()=>{for(const s of ['draft','quotation'])assert.equal(linesEditable(s),true);for(const s of ['confirmed','active','paused','closed'])assert.equal(linesEditable(s),false);});
test('transition controls follow lifecycle and plan flags',()=>{
 const plan={pausable:true,closable:true};assert.deepEqual(allowedTransitions('draft',plan,null,'2026-10-31'),['quotation','confirmed','closed']);assert.deepEqual(allowedTransitions('active',plan,null,'2026-10-31'),['paused','closed']);assert.deepEqual(allowedTransitions('paused',plan,null,'2026-10-31'),['active','closed']);assert.deepEqual(allowedTransitions('closed',plan,null,'2026-10-31'),[]);
 const restricted={pausable:false,closable:false};assert.deepEqual(allowedTransitions('active',restricted,'2026-12-31','2026-10-31'),[]);assert.deepEqual(allowedTransitions('active',restricted,'2026-10-30','2026-10-31'),['closed']);
});
