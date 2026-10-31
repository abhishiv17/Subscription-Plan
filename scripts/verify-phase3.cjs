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

const fixtures={subscriptions:[],quotation_templates:[],product_variants:[],products:[],plans:[],taxes:[],customers:[]};
let staffId;
async function create(table,values){const row=check(await service.from(table).insert(values).select('*').single());fixtures[table].push(row.id);return row;}
async function row(table,id){return check(await service.from(table).select('*').eq('id',id).single());}
async function countSubs(templateId){const r=await service.from('subscriptions').select('id',{count:'exact',head:true}).eq('template_id',templateId);check(r);return r.count;}
(async()=>{
 assert.ok(process.env.DEMO_TEST_PASSWORD,'Set DEMO_TEST_PASSWORD');
 const admin=session();const login=check(await admin.db.auth.signInWithPassword({email:'demo.admin@example.com',password:process.env.DEMO_TEST_PASSWORD}));
 const name='Template smoke '+suffix;
 const plan=await create('plans',{name,price:49,billing_period:'monthly'});
 const tax=await create('taxes',{name:name+' tax',rate:18});
 const overrideTax=await create('taxes',{name:name+' override',rate:5});
 const product=await create('products',{name:name+' product',sales_price:100,tax_id:tax.id,product_type:'software'});
 const otherProduct=await create('products',{name:name+' other',sales_price:200,tax_id:overrideTax.id,product_type:'goods'});
 const variant=await create('product_variants',{product_id:product.id,attribute:'Edition',value:'Pro',extra_price:25});
 const otherVariant=await create('product_variants',{product_id:otherProduct.id,attribute:'Size',value:'Large',extra_price:50});
 const customer=await create('customers',{name,email:'smoke-template-'+suffix+'@example.com'});
 let page=await admin.get('/templates');assert.equal(page.status,200);
 let url=await admin.post('/templates',forms(page.html).find(f=>f.includes('Create and add lines')),{name,plan_id:plan.id,validity_days:20,payment_terms_days:14,notes:'Template notes'});assert.ok(url.includes('ok='));
 const template=check(await service.from('quotation_templates').select('*').eq('name',name).single());fixtures.quotation_templates.push(template.id);
 page=await admin.get('/templates/'+template.id);let templateForm=forms(page.html).find(f=>f.includes('Save template'));
 url=await admin.post('/templates/'+template.id,templateForm,{name,plan_id:plan.id,validity_days:0,payment_terms_days:14});assert.ok(url.includes('err='));
 url=await admin.post('/templates/'+template.id,templateForm,{name:name+' edited',plan_id:plan.id,validity_days:20,payment_terms_days:14,notes:'Template notes'});assert.ok(url.includes('ok='));assert.equal((await row('quotation_templates',template.id)).name,name+' edited');
 assert.ok(page.html.includes('value="'+product.id+'"'),'Base product remains selectable even when it has variants');
 let addForm=forms(page.html).find(f=>f.includes('>Add line<'));
 url=await admin.post('/templates/'+template.id,addForm,{product:product.id,quantity:2,unit_price:'',tax_id:''});assert.ok(url.includes('ok='));
 page=await admin.get('/templates/'+template.id);addForm=forms(page.html).find(f=>f.includes('>Add line<'));
 url=await admin.post('/templates/'+template.id,addForm,{product:product.id+'|'+variant.id,quantity:3,unit_price:50,tax_id:overrideTax.id});assert.ok(url.includes('ok='));
 let lines=check(await service.from('quotation_template_lines').select('*').eq('template_id',template.id));assert.equal(lines.length,2);
 const variantLine=lines.find(l=>l.variant_id===variant.id);
 page=await admin.get('/templates/'+template.id);let editForm=forms(page.html).find(f=>f.includes(variantLine.id)&&f.includes('Save line'));
 url=await admin.post('/templates/'+template.id,editForm,{product:otherProduct.id+'|'+otherVariant.id,quantity:4,unit_price:0,tax_id:tax.id});assert.ok(url.includes('ok='));assert.equal(Number((await row('quotation_template_lines',variantLine.id)).unit_price),0);
 page=await admin.get('/templates/'+template.id);editForm=forms(page.html).find(f=>f.includes(variantLine.id)&&f.includes('Save line'));
 url=await admin.post('/templates/'+template.id,editForm,{product:product.id+'|'+variant.id,quantity:3,unit_price:'',tax_id:overrideTax.id});assert.ok(url.includes('ok='));assert.equal((await row('quotation_template_lines',variantLine.id)).unit_price,null);
 url=await admin.post('/templates/'+template.id,editForm,{product:product.id+'|'+otherVariant.id,quantity:3,unit_price:'',tax_id:''});assert.ok(url.includes('err='));
 url=await admin.post('/templates/'+template.id,editForm,{product:product.id,quantity:0,unit_price:'',tax_id:''});assert.ok(url.includes('err='));
 const mismatch=await admin.db.from('quotation_template_lines').insert({template_id:template.id,product_id:product.id,variant_id:otherVariant.id,quantity:1});assert.ok(mismatch.error,'Database rejects a variant from another product');
 page=await admin.get('/templates/'+template.id);addForm=forms(page.html).find(f=>f.includes('>Add line<'));
 url=await admin.post('/templates/'+template.id,addForm,{product:otherProduct.id,quantity:1,unit_price:'',tax_id:''});assert.ok(url.includes('ok='));
 const removable=check(await service.from('quotation_template_lines').select('*').eq('template_id',template.id).eq('product_id',otherProduct.id).single());
 page=await admin.get('/templates/'+template.id);url=await admin.post('/templates/'+template.id,forms(page.html).find(f=>f.includes(removable.id)&&f.includes('Remove')),{});assert.ok(url.includes('ok='));
 lines=check(await service.from('quotation_template_lines').select('*').eq('template_id',template.id));assert.equal(lines.length,2);
 console.log('PASS templates create/edit, plan/terms/validity, base/variant lines, edit/remove, zero/list prices and validation');
 const newPath='/subscriptions/new?template='+template.id+'&customer='+customer.id;
 page=await admin.get(newPath);assert.equal(page.status,200);
 // Inspect the rendered option with an explicit RegExp (the ID is a UUID).
 assert.ok(new RegExp('<option(?=[^>]*value="'+template.id+'")[^>]*selected').test(page.html),'Template is preselected');
 assert.ok(new RegExp('<option(?=[^>]*value="'+customer.id+'")[^>]*selected').test(page.html),'Selected customer remains available outside the first 50 matches');
 const searched=await admin.get('/subscriptions/new?template='+template.id+'&customerSearch='+encodeURIComponent(customer.email));assert.ok(searched.html.includes(customer.id));assert.ok(searched.html.includes(template.id));
 let subForm=forms(page.html).find(f=>f.includes('Create subscription'));
 const subValues={customer_id:customer.id,template_id:template.id,plan_id:'',start_date:'2026-10-31',payment_terms_days:999,notes:''};
 url=await admin.post(newPath,subForm,subValues);assert.ok(url.includes('ok='),url);
 const subId=new URL(url,base).pathname.split('/')[2];fixtures.subscriptions.push(subId);
 const sub=await row('subscriptions',subId);assert.equal(sub.status,'draft');assert.equal(sub.plan_id,plan.id);assert.equal(sub.template_id,template.id);assert.equal(sub.payment_terms_days,14);assert.equal(sub.notes,'Template notes');
 const copied=check(await service.from('subscription_lines').select('*').eq('subscription_id',subId));assert.equal(copied.length,2);
 const baseLine=copied.find(l=>!l.variant_id),copiedVariant=copied.find(l=>l.variant_id===variant.id);
 assert.equal(Number(baseLine.unit_price),100);assert.equal(Number(baseLine.quantity),2);assert.equal(baseLine.tax_id,tax.id);
 assert.equal(Number(copiedVariant.unit_price),125);assert.equal(Number(copiedVariant.quantity),3);assert.equal(copiedVariant.tax_id,overrideTax.id);
 page=await admin.get('/subscriptions/'+subId);url=await admin.post('/subscriptions/'+subId,forms(page.html).find(f=>f.includes('Send quotation')),{});assert.ok(url.includes('ok='));
 const quoted=await row('subscriptions',subId);
 assert.equal((Date.parse(quoted.quotation_valid_until)-Date.parse(new Date().toISOString().slice(0,10)))/86400000,20,'Quotation uses template validity days');
 check(await service.from('quotation_template_lines').update({unit_price:77}).eq('id',variantLine.id));assert.equal(Number((await row('subscription_lines',copiedVariant.id)).unit_price),125);
 console.log('PASS preselected template/customer, customer search, draft plan/terms/notes/lines/tax copy and price snapshots');
 const empty=await create('quotation_templates',{name:name+' empty',plan_id:plan.id});
 const sourcePage=await admin.get('/templates/'+template.id);
 const removeForm=forms(sourcePage.html).find(f=>f.includes(variantLine.id)&&f.includes('Remove'));
 const crossTemplate=await admin.post('/templates/'+empty.id,removeForm.replaceAll(template.id,empty.id),{});assert.ok(crossTemplate.includes('err='));assert.equal((await row('quotation_template_lines',variantLine.id)).template_id,template.id);
 const rejected=await admin.db.rpc('create_subscription_from_template',{p_template_id:empty.id,p_customer_id:customer.id});assert.ok(rejected.error);assert.equal(await countSubs(empty.id),0);
 // A constraint error during line insertion must roll back the newly inserted draft too.
 check(await service.from('quotation_template_lines').update({unit_price:null}).eq('id',variantLine.id));
 check(await service.from('product_variants').update({extra_price:-1000}).eq('id',variant.id));
 const before=await countSubs(template.id);
 const missing=await admin.db.rpc('create_subscription_from_template',{p_template_id:randomUUID(),p_customer_id:customer.id});assert.ok(missing.error);
 check(await service.from('plans').update({active:false}).eq('id',plan.id));
 const inactivePlan=await admin.db.rpc('create_subscription_from_template',{p_template_id:template.id,p_customer_id:customer.id});assert.ok(inactivePlan.error);assert.equal(await countSubs(template.id),before);
 check(await service.from('plans').update({active:true}).eq('id',plan.id));
 const rolledBack=await admin.db.rpc('create_subscription_from_template',{p_template_id:template.id,p_customer_id:customer.id});assert.ok(rolledBack.error);assert.equal(await countSubs(template.id),before);
 check(await service.from('product_variants').update({extra_price:25}).eq('id',variant.id));
 check(await service.from('products').update({active:false}).eq('id',product.id));
 const inactive=await admin.db.rpc('create_subscription_from_template',{p_template_id:template.id,p_customer_id:customer.id});assert.ok(inactive.error);assert.equal(await countSubs(template.id),before);
 check(await service.from('products').update({active:true}).eq('id',product.id));
 console.log('PASS empty/inactive template guards and complete rollback when copied line validation fails');
 const email='smoke-phase3-staff-'+suffix+'@example.com',password='Template-'+randomUUID()+'!aA';
 const user=check(await service.auth.admin.createUser({email,password,email_confirm:true}));staffId=user.user.id;
 const member=session();check(await member.db.auth.signInWithPassword({email,password}));
 const contact=check(await service.from('customers').select('id').eq('user_id',staffId).single());fixtures.customers.push(contact.id);
 assert.ok((await member.get('/templates')).location.endsWith('/portal'));
 page=await admin.get('/templates/'+template.id);templateForm=forms(page.html).find(f=>f.includes('Save template'));
 const blocked=await member.post('/templates/'+template.id,templateForm,{name:'Forbidden',plan_id:plan.id,validity_days:1,payment_terms_days:0});assert.ok(blocked.endsWith('/portal'));
 const rpcDenied=await member.db.rpc('create_subscription_from_template',{p_template_id:template.id,p_customer_id:customer.id});assert.ok(rpcDenied.error);
 check(await service.rpc('set_account_role',{p_actor:login.user.id,p_profile:staffId,p_role:'staff'}));
 assert.equal((await member.get('/templates')).status,200);
 page=await member.get('/templates/'+template.id);editForm=forms(page.html).find(f=>f.includes(variantLine.id)&&f.includes('Save line'));
 url=await member.post('/templates/'+template.id,editForm,{product:product.id+'|'+variant.id,quantity:5,unit_price:88,tax_id:overrideTax.id});assert.ok(url.includes('ok='));assert.equal(Number((await row('quotation_template_lines',variantLine.id)).quantity),5);
 page=await member.get(newPath);subForm=forms(page.html).find(f=>f.includes('Create subscription'));
 url=await member.post(newPath,subForm,subValues);assert.ok(url.includes('ok='));const staffSubId=new URL(url,base).pathname.split('/')[2];fixtures.subscriptions.push(staffSubId);
 const staffLines=check(await service.from('subscription_lines').select('*').eq('subscription_id',staffSubId));assert.equal(Number(staffLines.find(l=>l.variant_id).unit_price),88);
 console.log('PASS staff template editing and subscription creation; customers denied UI/actions/RPC');
 console.log('Phase 3 integration checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 for(const table of ['subscriptions','quotation_templates','product_variants','products','plans','taxes','customers'])if(fixtures[table].length){const r=await service.from(table).delete().in('id',fixtures[table]);if(r.error){console.error('Cleanup failed:',table,r.error.message);process.exitCode=1;}}
 if(staffId){const r=await service.auth.admin.deleteUser(staffId);if(r.error){console.error('Staff cleanup failed',r.error.message);process.exitCode=1;}}
});
