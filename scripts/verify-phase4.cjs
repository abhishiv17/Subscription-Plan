/* eslint-disable @typescript-eslint/no-require-imports */
// Run against a production/dev server with TEST_BASE_URL and DEMO_TEST_PASSWORD.
// Creates isolated catalogue fixtures and removes only those fixtures in finally.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
process.loadEnvFile('.env.local');
const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const suffix = randomUUID();
const decode = s => (s || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function session() {
  const jar = new Map();
  const db = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...jar].map(([name,value])=>({name,value})), setAll: cs => cs.forEach(c=>jar.set(c.name,c.value)) } });
  const headers = () => ({ cookie: [...jar].map(([k,v])=>`${k}=${v}`).join('; '), origin: base });
  return { db, async get(path) { const r=await fetch(base+path,{headers:headers(),redirect:'manual'}); return {status:r.status,html:await r.text(),location:r.headers.get('location')}; }, async post(path,form,values) {
    assert.ok(form, `Missing form on ${path}`);
    const body=new FormData();
    for(const tag of form.match(/<input\b[^>]*>/g)||[]) { if(!tag.includes('type="hidden"'))continue; const name=decode(tag.match(/name="([^"]*)"/)?.[1]); if(name)body.append(name,decode(tag.match(/value="([^"]*)"/)?.[1])); }
    for(const [k,v] of Object.entries(values))for(const entry of Array.isArray(v)?v:[v])if(entry!==null)body.append(k,String(entry));
    const r=await fetch(base+path,{method:'POST',headers:headers(),body,redirect:'manual'});
    const location=r.headers.get('location'); assert.ok([303,307].includes(r.status), `POST ${path}: ${r.status} ${(await r.text()).slice(0,100)}`); return location;
  }};
}
const forms = html => html.match(/<form\b[^>]*>[\s\S]*?<\/form>/g)||[];
const check = (result) => { if(result.error) throw Error(result.error.message); return result.data; };

const fixtures={subscriptions:[],products:[],product_variants:[],plans:[],taxes:[],discounts:[],customers:[]};
let testUserId;
async function create(table,values){const r=check(await service.from(table).insert(values).select('*').single());fixtures[table].push(r.id);return r;}
async function row(table,id){return check(await service.from(table).select('*').eq('id',id).single());}
const findForm=(page,label)=>forms(page.html).find(f=>f.includes('>'+label+'<'));
(async()=>{
 assert.ok(process.env.DEMO_TEST_PASSWORD,'Set DEMO_TEST_PASSWORD');
 const admin=session();const login=check(await admin.db.auth.signInWithPassword({email:'demo.admin@example.com',password:process.env.DEMO_TEST_PASSWORD}));
 const name='Subscriptions smoke '+suffix;
 const plan=await create('plans',{name,price:49,billing_period:'monthly',min_quantity:2,pausable:true,closable:true,renewable:true});
 const tax=await create('taxes',{name,rate:18});
 const product=await create('products',{name,sales_price:100,tax_id:tax.id});
 const variant=await create('product_variants',{product_id:product.id,attribute:'Edition',value:'Pro',extra_price:25});
 const otherProduct=await create('products',{name:name+' other',sales_price:5});
 const otherVariant=await create('product_variants',{product_id:otherProduct.id,attribute:'Size',value:'Other',extra_price:1});
 const discount=await create('discounts',{name,scope:'subscription',discount_type:'percent',value:10});
 const email='smoke-phase4-'+suffix+'@example.com',password='Subscription-'+randomUUID()+'!aA';
 const user=check(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:name}}));testUserId=user.user.id;
 const customer=check(await service.from('customers').select('*').eq('user_id',testUserId).single());fixtures.customers.push(customer.id);
 const otherCustomer=await create('customers',{name:name+' other',email:'smoke-phase4-other-'+suffix+'@example.com'});
 const member=session();check(await member.db.auth.signInWithPassword({email,password}));
 const newPath='/subscriptions/new?customer='+customer.id;
 let page=await admin.get(newPath);let newForm=findForm(page,'Create subscription');
 const values={customer_id:customer.id,plan_id:plan.id,discount_id:discount.id,start_date:'2026-10-31',expiry_date:'2026-10-31',payment_terms_days:7,notes:'Phase 4 quotation notes'};
 let url=await admin.post(newPath,newForm,{...values,expiry_date:'2026-01-01'});assert.ok(url.includes('err='));
 url=await admin.post(newPath,newForm,values);assert.ok(url.includes('ok='));const id=new URL(url,base).pathname.split('/')[2];fixtures.subscriptions.push(id);
 assert.equal((await row('subscriptions',id)).discount_id,discount.id);
 const path='/subscriptions/'+id;
 const otherSub=await create('subscriptions',{customer_id:otherCustomer.id,plan_id:plan.id,start_date:'2026-10-31'});
 assert.equal((await member.get('/quotations/'+id)).status,404,'Customer cannot read an unissued draft');
 page=await admin.get(path);let addForm=findForm(page,'Add line');let confirmForm=findForm(page,'Confirm');
 url=await admin.post(path,confirmForm,{});assert.ok(url.includes('err='),'Cannot confirm empty draft');
 const lineValues={product_id:product.id,variant_id:variant.id,quantity:1,unit_price:'',tax_id:'',description:'Phase 4 described line'};
 url=await admin.post(path,addForm,lineValues);assert.ok(url.includes('ok='));
 let line=check(await service.from('subscription_lines').select('*').eq('subscription_id',id).single());
 assert.equal(Number(line.unit_price),125);assert.equal(line.tax_id,tax.id);
 page=await admin.get(path);confirmForm=findForm(page,'Confirm');url=await admin.post(path,confirmForm,{});assert.ok(url.includes('err='),'Plan minimum enforced');
 let editForm=forms(page.html).find(f=>f.includes(line.id)&&f.includes('>Save line<'));
 url=await admin.post(path,editForm,{...lineValues,quantity:2,unit_price:110});assert.ok(url.includes('ok='));assert.equal(Number((await row('subscription_lines',line.id)).unit_price),110);
 url=await admin.post(path,editForm,{...lineValues,quantity:2,unit_price:''});assert.ok(url.includes('ok='));
 page=await admin.get(path);assert.ok(page.html.includes('295.00'),'Per-period preview includes line-rounded tax');
 editForm=forms(page.html).find(f=>f.includes(line.id)&&f.includes('>Save line<'));
 url=await admin.post(path,editForm,{...lineValues,quantity:0});assert.ok(url.includes('err='));
 url=await admin.post(path,editForm,{...lineValues,quantity:1.005});assert.ok(url.includes('err='),'Reject extra decimal precision');
 url=await admin.post(path,editForm,{...lineValues,variant_id:otherVariant.id});assert.ok(url.includes('err='));
 const mismatch=await admin.db.from('subscription_lines').insert({subscription_id:id,product_id:product.id,variant_id:otherVariant.id,quantity:1,unit_price:1});assert.ok(mismatch.error);
 const reparent=await admin.db.from('subscription_lines').update({subscription_id:otherSub.id}).eq('id',line.id);assert.ok(reparent.error);
 addForm=findForm(page,'Add line');url=await admin.post(path,addForm,{product_id:otherProduct.id,variant_id:'',quantity:1,unit_price:0,tax_id:''});assert.ok(url.includes('ok='));
 const removable=check(await service.from('subscription_lines').select('*').eq('subscription_id',id).eq('product_id',otherProduct.id).single());
 page=await admin.get(path);const removeExtra=forms(page.html).find(f=>f.includes(removable.id)&&f.includes('>Remove<'));
 const cross=await admin.post('/subscriptions/'+otherSub.id,removeExtra.replaceAll(id,otherSub.id),{});assert.ok(cross.includes('err='));assert.equal((await row('subscription_lines',removable.id)).subscription_id,id);
 url=await admin.post(path,removeExtra,{});assert.ok(url.includes('ok='));
 console.log('PASS new subscription fields, line defaults/overrides, edit/remove, live totals, min quantity and variant/parent guards');
 page=await admin.get(path);const sendQuote=findForm(page,'Send quotation');url=await admin.post(path,sendQuote,{});assert.ok(url.includes('ok='));
 page=await admin.get(path);const issuedConfirm=findForm(page,'Confirm');
 assert.equal((await member.get('/quotations/'+id)).status,200);
 const quote=await member.get('/quotations/'+id);assert.ok(quote.html.includes('Valid until:'));assert.ok(quote.html.includes('Phase 4 described line'));assert.ok(quote.html.includes('>Print<'));
 assert.ok((await member.get('/portal')).html.includes('/quotations/'+id));
 assert.equal((await member.get('/quotations/'+otherSub.id)).status,404);
 assert.equal((await session().get('/quotations/'+id)).status,307);
 assert.equal((await admin.get('/quotations/not-a-uuid')).status,404);
 check(await service.from('subscriptions').update({quotation_valid_until:'2020-01-01'}).eq('id',id));
 page=await admin.get(path);assert.ok(!findForm(page,'Confirm'));assert.ok(page.html.includes('quotation has expired'));
 url=await admin.post(path,issuedConfirm,{});assert.ok(url.includes('err='));
 url=await admin.post(path,findForm(page,'Back to draft'),{});assert.ok(url.includes('ok='));assert.equal((await row('subscriptions',id)).quotation_valid_until,null);
 page=await admin.get(path);url=await admin.post(path,findForm(page,'Send quotation'),{});assert.ok(url.includes('ok='));assert.ok((await row('subscriptions',id)).quotation_valid_until>'2020-01-01');
 console.log('PASS customer-printable own quotation, draft/foreign isolation, expired quotation guard and fresh validity on reissue');
 page=await admin.get(path);const forgedEdit=forms(page.html).find(f=>f.includes(line.id)&&f.includes('>Save line<'));const forgedRemove=forms(page.html).find(f=>f.includes(line.id)&&f.includes('>Remove<'));
 url=await admin.post(path,findForm(page,'Confirm'),{});assert.ok(url.includes('ok='));assert.equal((await row('subscriptions',id)).status,'confirmed');
 for(const status of ['confirmed','active','paused','closed']){
   if(status==='active'){page=await admin.get(path);url=await admin.post(path,findForm(page,'Activate'),{});assert.ok(url.includes('ok='));}
   if(status==='paused'){page=await admin.get(path);url=await admin.post(path,findForm(page,'Pause'),{});assert.ok(url.includes('ok='));}
   if(status==='closed') break;
   page=await admin.get(path);assert.ok(!findForm(page,'Add line'));assert.ok(!findForm(page,'Save line'));
   url=await admin.post(path,forgedEdit,{...lineValues,quantity:99});assert.ok(url.includes('err='));url=await admin.post(path,forgedRemove,{});assert.ok(url.includes('err='));
   for(const mutation of [admin.db.from('subscription_lines').insert({subscription_id:id,product_id:product.id,quantity:1,unit_price:1}),admin.db.from('subscription_lines').update({quantity:99}).eq('id',line.id),admin.db.from('subscription_lines').delete().eq('id',line.id)])assert.ok((await mutation).error,'DB line lock for '+status);
 }
 page=await admin.get(path);assert.ok(!findForm(page,'Bill now'));url=await admin.post(path,findForm(page,'Resume'),{});assert.ok(url.includes('ok='));
 page=await admin.get(path);const billForm=findForm(page,'Bill now');const renewForm=findForm(page,'Renew');const pauseForm=findForm(page,'Pause');const closeForm=findForm(page,'Close');
 url=await admin.post(path,billForm,{});assert.ok(url.includes('/invoices/'));const invoiceId=new URL(url,base).pathname.split('/')[2];const invoice=await row('invoices',invoiceId);assert.equal(Number(invoice.total),265.5);assert.equal(invoice.subscription_id,id);
 page=await admin.get(path);assert.ok(page.html.includes(invoice.number));assert.ok(!findForm(page,'Bill now'),'Expiry boundary hides billing');
 const beyond=await admin.db.rpc('bill_subscription_now',{p_subscription_id:id});assert.ok(beyond.error);
 url=await admin.post(path,renewForm,{});assert.ok(url.includes('ok='));assert.equal((await row('subscriptions',id)).expiry_date,'2026-11-30');
 page=await admin.get(path);assert.ok(findForm(page,'Bill now'));
 url=await admin.post(path,findForm(page,'Pause'),{});assert.ok(url.includes('ok='));page=await admin.get(path);assert.ok(findForm(page,'Resume'));assert.ok(!findForm(page,'Bill now'));
 url=await admin.post(path,findForm(page,'Resume'),{});assert.ok(url.includes('ok='));
 url=await admin.post(path,closeForm,{});assert.ok(url.includes('ok='));page=await admin.get(path);assert.ok(!findForm(page,'Renew'));assert.ok(!findForm(page,'Bill now'));assert.ok(!findForm(page,'Add line'));
 assert.ok((await admin.db.from('subscription_lines').update({quantity:99}).eq('id',line.id)).error);
 console.log('PASS confirmation/active/paused/closed line locks, pause/resume/close, billing with discount/tax, expiry boundary, renewal and related invoices');
 const restrictedPlan=await create('plans',{name:name+' restricted',price:1,billing_period:'monthly',pausable:false,closable:false,renewable:false});
 const restricted=await create('subscriptions',{customer_id:otherCustomer.id,plan_id:restrictedPlan.id,start_date:'2020-01-01',expiry_date:'2099-01-01'});
 check(await service.from('subscription_lines').insert({subscription_id:restricted.id,product_id:product.id,quantity:1,unit_price:1}));
 check(await service.from('subscriptions').update({status:'confirmed'}).eq('id',restricted.id));check(await service.from('subscriptions').update({status:'active'}).eq('id',restricted.id));
 page=await admin.get('/subscriptions/'+restricted.id);for(const label of ['Pause','Renew','Close'])assert.ok(!findForm(page,label));
 for(const [form,label] of [[pauseForm,'pause'],[renewForm,'renew'],[closeForm,'close']]){url=await admin.post('/subscriptions/'+restricted.id,form.replaceAll(id,restricted.id),{});assert.ok(url.includes('err='),'Restricted '+label);}
 check(await service.from('subscriptions').update({expiry_date:'2020-01-31'}).eq('id',restricted.id));page=await admin.get('/subscriptions/'+restricted.id);assert.ok(findForm(page,'Close'),'Expired subscriptions may close even without early closing');
 url=await admin.post('/subscriptions/'+restricted.id,findForm(page,'Close'),{});assert.ok(url.includes('ok='));
 const filtered=await admin.get('/subscriptions?status=closed&customer='+customer.id+'&plan='+plan.id);assert.ok(filtered.html.includes((await row('subscriptions',id)).number));assert.ok(!filtered.html.includes(otherSub.number));
 const excluded=await admin.get('/subscriptions?status=active&customer='+customer.id+'&plan='+plan.id);assert.ok(!excluded.html.includes((await row('subscriptions',id)).number));
 assert.equal((await admin.get('/subscriptions?status=bogus&customer=bad&plan=bad&page=1.5')).status,200);
 console.log('PASS plan-controlled actions, expired closing, status/customer/plan filters and malformed filter handling');
 const denied=await member.post(path,forgedEdit,{...lineValues,quantity:99});assert.ok(denied.endsWith('/portal'));
 check(await service.rpc('set_account_role',{p_actor:login.user.id,p_profile:testUserId,p_role:'staff'}));
 assert.equal((await member.get('/subscriptions')).status,200);
 page=await member.get('/subscriptions/'+otherSub.id);url=await member.post('/subscriptions/'+otherSub.id,findForm(page,'Add line'),{...lineValues,quantity:2});assert.ok(url.includes('ok='));
 console.log('PASS customer action denial and approved staff subscription editing');
 console.log('Phase 4 integration checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 if(fixtures.subscriptions.length){const r=await service.from('invoices').delete().in('subscription_id',fixtures.subscriptions);if(r.error){console.error('Invoice cleanup failed',r.error.message);process.exitCode=1;}}
 for(const table of ['subscriptions','product_variants','products','plans','taxes','discounts','customers'])if(fixtures[table].length){const r=await service.from(table).delete().in('id',fixtures[table]);if(r.error){console.error('Cleanup failed:',table,r.error.message);process.exitCode=1;}}
 if(testUserId){const r=await service.auth.admin.deleteUser(testUserId);if(r.error){console.error('Account cleanup failed',r.error.message);process.exitCode=1;}}
});
