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
const fixtures = { taxes: [], products: [], plans: [], discounts: [] };
let staffId;
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
async function row(table,id){return check(await service.from(table).select('*').eq('id',id).single());}
async function find(table,name){const data=check(await service.from(table).select('*').eq('name',name).single());fixtures[table].push(data.id);return data;}
(async()=>{
 assert.ok(process.env.DEMO_TEST_PASSWORD,'Set DEMO_TEST_PASSWORD');
 const admin=session(); check(await admin.db.auth.signInWithPassword({email:'demo.admin@example.com',password:process.env.DEMO_TEST_PASSWORD}));
 const name='Catalogue smoke '+suffix;
 let page=await admin.get('/taxes');assert.equal(page.status,200);
 let url=await admin.post('/taxes',forms(page.html).find(f=>f.includes('Add tax')),{name,rate:'12'});assert.ok(url.includes('ok='));
 const tax=await find('taxes',name);
 page=await admin.get('/taxes');
 url=await admin.post('/taxes',forms(page.html).find(f=>f.includes(tax.id)&&f.includes('Save tax')),{name,rate:'18'});assert.ok(url.includes('ok='));assert.equal(Number((await row('taxes',tax.id)).rate),18);
 page=await admin.get('/taxes');url=await admin.post('/taxes',forms(page.html).find(f=>f.includes(tax.id)&&f.includes('Deactivate')),{});assert.ok(url.includes('ok='));assert.equal((await row('taxes',tax.id)).active,false);
 console.log('PASS taxes create, edit and deactivate');
 page=await admin.get('/products');url=await admin.post('/products',forms(page.html).find(f=>f.includes('Create product')),{name,product_type:'software',sales_price:'100',cost_price:'20',tax_id:tax.id});assert.ok(url.includes('/products/'));
 const product=await find('products',name);
 page=await admin.get('/products/'+product.id);url=await admin.post('/products/'+product.id,forms(page.html).find(f=>f.includes('Save product')),{name,product_type:'software',sales_price:'150',cost_price:'25',tax_id:tax.id,active:'on'});assert.ok(url.includes('ok='));assert.equal((await row('products',product.id)).tax_id,tax.id);assert.equal(Number((await row('products',product.id)).sales_price),150);
 page=await admin.get('/products/'+product.id);url=await admin.post('/products/'+product.id,forms(page.html).find(f=>f.includes('name="attribute"')&&!f.includes('Save variant')),{attribute:'Size',value:'Large',extra_price:'25'});assert.ok(url.includes('ok='));
 let variant=check(await service.from('product_variants').select('*').eq('product_id',product.id).single());
 page=await admin.get('/products/'+product.id);url=await admin.post('/products/'+product.id,forms(page.html).find(f=>f.includes(variant.id)&&f.includes('Save variant')),{attribute:'Size',value:'Small',extra_price:'10'});assert.ok(url.includes('ok='));assert.equal((await row('product_variants',variant.id)).value,'Small');
 const filtered=await admin.get('/products?type=goods&active=true');assert.ok(!filtered.html.includes(name));
 const included=await admin.get('/products?type=software&active=true');assert.ok(included.html.includes(name));
 page=await admin.get('/products/'+product.id);url=await admin.post('/products/'+product.id,forms(page.html).find(f=>f.includes(variant.id)&&f.includes('Remove')),{});assert.ok(url.includes('ok='));assert.equal(check(await service.from('product_variants').select('id').eq('product_id',product.id)).length,0);
 console.log('PASS products edit, inactive tax preservation, filters and variants');
 const planValues={name,price:'99',billing_period:'weekly',min_quantity:'2',start_date:'2026-01-01',end_date:'2030-01-01',closable:'on',pausable:'on',renewable:'on',auto_close:'on',active:'on'};
 page=await admin.get('/plans/new');url=await admin.post('/plans/new',forms(page.html).find(f=>f.includes('Save plan')),planValues);assert.ok(url.includes('ok='));
 const plan=await find('plans',name);page=await admin.get('/plans/'+plan.id);const planForm=forms(page.html).find(f=>f.includes('Save plan'));
 url=await admin.post('/plans/'+plan.id,planForm,{...planValues,end_date:'2025-01-01'});assert.ok(url.includes('err='));
 url=await admin.post('/plans/'+plan.id,planForm,{...planValues,price:'199',pausable:null});assert.ok(url.includes('ok='));assert.equal((await row('plans',plan.id)).pausable,false);assert.equal(Number((await row('plans',plan.id)).price),199);
 console.log('PASS plans create, edit, flags and date validation');
 const discountValues={name,discount_type:'percent',value:'10',scope:'product',product_ids:product.id,min_purchase:'0',min_quantity:'0',usage_limit:'5',active:'on'};
 page=await admin.get('/discounts');url=await admin.post('/discounts',forms(page.html).find(f=>f.includes('Save discount')),discountValues);assert.ok(url.includes('ok='),url);
 const discount=await find('discounts',name);assert.equal(check(await service.from('discount_products').select('*').eq('discount_id',discount.id)).length,1);
 check(await service.from('discounts').update({used_count:2}).eq('id',discount.id));
 page=await admin.get('/discounts/'+discount.id);const discountForm=forms(page.html).find(f=>f.includes('Save discount'));
 url=await admin.post('/discounts/'+discount.id,discountForm,{...discountValues,value:'101'});assert.ok(url.includes('err='));
 url=await admin.post('/discounts/'+discount.id,discountForm,{...discountValues,product_ids:randomUUID(),name:'Invalid product'});assert.ok(url.includes('err='));assert.equal((await row('discounts',discount.id)).name,name);assert.equal(check(await service.from('discount_products').select('*').eq('discount_id',discount.id)).length,1);
 url=await admin.post('/discounts/'+discount.id,discountForm,{...discountValues,discount_type:'fixed',value:'25',scope:'subscription',product_ids:[]});assert.ok(url.includes('ok='));assert.equal((await row('discounts',discount.id)).used_count,2);assert.equal(check(await service.from('discount_products').select('*').eq('discount_id',discount.id)).length,0);
 console.log('PASS discounts create/edit, atomic rollback, scope changes and preserved usage');
 const password='Smoke-'+randomUUID()+'!aA';const email='smoke-staff-'+suffix+'@example.com';
 const user=check(await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{role:'staff'}}));staffId=user.user.id;
 check(await service.from("profiles").update({role:"staff"}).eq("id",staffId));
 assert.equal((await row("profiles",staffId)).role,"staff");
 const staff=session();check(await staff.db.auth.signInWithPassword({email,password}));
 for(const path of ['/taxes','/products','/plans','/discounts','/products/'+product.id,'/plans/'+plan.id,'/discounts/'+discount.id]){const p=await staff.get(path);assert.equal(p.status,200,path);assert.ok(!/>(Save tax|Add tax|Save discount|Create product|Save product|Save variant|Save plan|Deactivate|Remove)<\//.test(p.html),'Staff mutation control '+path);}
 const denied=await staff.post('/plans/'+plan.id,planForm,{...planValues,price:'1'});assert.ok(denied.endsWith('/dashboard'));assert.equal(Number((await row('plans',plan.id)).price),199);
 const write=await staff.db.from('taxes').insert({name:'Forbidden '+suffix,rate:1});assert.ok(write.error);
 const rpc=await staff.db.rpc('save_catalog_discount',{p_id:discount.id,p_values:discountValues,p_product_ids:[product.id]});assert.ok(rpc.error);
 console.log('PASS staff catalogue read-only UI, server action guard and RLS');
 console.log('Phase 1 checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 for(const table of ['discounts','plans','products','taxes'])if(fixtures[table].length){const r=await service.from(table).delete().in('id',fixtures[table]);if(r.error){console.error('Cleanup failed:',table,r.error.message);process.exitCode=1;}}
 if(staffId){check(await service.from("customers").delete().eq("user_id",staffId));const r=await service.auth.admin.deleteUser(staffId);if(r.error){console.error('Staff cleanup failed',r.error.message);process.exitCode=1;}}
});
