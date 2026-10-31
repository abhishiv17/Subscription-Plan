/* eslint-disable @typescript-eslint/no-require-imports */
// Run against a production/dev server with TEST_BASE_URL and DEMO_TEST_PASSWORD.
// Creates isolated catalogue fixtures and removes only those fixtures in finally.
const assert = require('node:assert/strict');
const { acceptInvitation } = require('../src/lib/invitations.ts');
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

const created={customers:[],invoices:[],subscriptions:[],plans:[]};
let testUserId;
async function row(table,id){return check(await service.from(table).select('*').eq('id',id).single());}
(async()=>{
 assert.ok(process.env.DEMO_TEST_PASSWORD,'Set DEMO_TEST_PASSWORD');
 const admin=session();const login=check(await admin.db.auth.signInWithPassword({email:'demo.admin@example.com',password:process.env.DEMO_TEST_PASSWORD}));
 const actor=login.user.id;
 const name='People smoke '+suffix,email='smoke-customer-'+suffix+'@example.com';
 let page=await admin.get('/customers/new');assert.equal(page.status,200);
 let url=await admin.post('/customers/new',forms(page.html).find(f=>f.includes('Save customer')),{name,email,company:'People verification'});assert.ok(url.includes('ok='));
 const customer=check(await service.from('customers').select('*').eq('email',email).single());created.customers.push(customer.id);
 page=await admin.get('/customers/'+customer.id);const customerForm=forms(page.html).find(f=>f.includes('Save customer'));
 url=await admin.post('/customers/'+customer.id,customerForm,{name:name+' edited',email,phone:'12345',company:'Edited company'});assert.ok(url.includes('ok='));assert.equal((await row('customers',customer.id)).company,'Edited company');
 url=await admin.post('/customers/'+customer.id,customerForm,{name,email:'bad-email'});assert.ok(url.includes('err='));
 const duplicatePage=await admin.get('/customers/new');url=await admin.post('/customers/new',forms(duplicatePage.html).find(f=>f.includes('Save customer')),{name,email});assert.ok(url.includes('err='));
 page=await admin.get('/customers?q='+encodeURIComponent(email));assert.ok(page.html.includes(name+' edited'));
 const plan=check(await service.from('plans').insert({name,price:10,billing_period:'monthly'}).select('*').single());created.plans.push(plan.id);
 const sub=check(await service.from('subscriptions').insert({customer_id:customer.id,plan_id:plan.id,start_date:'2026-01-01'}).select('*').single());created.subscriptions.push(sub.id);
 const invoices=check(await service.from('invoices').insert([
  ...Array.from({length:21},(_,i)=>({customer_id:customer.id,total:10,amount_paid:i===0?3:0,status:'confirmed',invoice_date:'2026-01-01'})),
  {customer_id:customer.id,total:999,status:'draft'},
  {customer_id:customer.id,total:777,status:'cancelled'},
 ].map(invoice=>({invoice_date:'2026-01-01',amount_paid:0,...invoice}))).select('id'));created.invoices.push(...invoices.map(i=>i.id));
 assert.equal(Number(check(await admin.db.rpc('customer_balance',{p_customer_id:customer.id}))),207);
 page=await admin.get('/customers/'+customer.id);assert.ok(page.html.includes(sub.number));assert.ok(page.html.includes('207.00'));assert.ok(page.html.includes('Invoice history'));
 const secondPage=await admin.get('/customers/'+customer.id+'?invoicesPage=2');assert.equal(secondPage.status,200);assert.ok(secondPage.html.includes('207.00'));assert.ok(secondPage.html.includes('21')); 
 console.log('PASS customer create/edit/search, validation, subscriptions and balance beyond 20 invoices');
 const userEmail='smoke-people-'+suffix+'@example.com';
 // generateLink exercises the real invite token flow without delivering an email.
 const user=check(await service.auth.admin.generateLink({type:'invite',email:userEmail,options:{data:{full_name:'People verification account'},redirectTo:base+'/accept-invite'}}));testUserId=user.user.id;
 const contact=check(await service.from('customers').select('id').eq('user_id',testUserId).single());created.customers.push(contact.id);
 const member=session();await acceptInvitation(member.db,base+'/accept-invite?token_hash='+encodeURIComponent(user.properties.hashed_token));
 const inviteSession=check(await member.db.auth.getSession()).session;
 const implicit=session();await acceptInvitation(implicit.db,base+'/accept-invite#'+new URLSearchParams({access_token:inviteSession.access_token,refresh_token:inviteSession.refresh_token}));
 assert.equal((await implicit.get('/reset-password')).status,200);
 console.log('PASS real invitation token verification, implicit session and password setup route (no email sent)');
 page=await admin.get('/users?q='+encodeURIComponent(userEmail));assert.ok(page.html.includes(userEmail));assert.ok(page.html.includes('Send invitation'));
 const roleForm=forms(page.html).find(f=>f.includes(testUserId)&&f.includes('Save role'));
 assert.ok(roleForm);
 let forbidden=await member.get('/users');assert.ok(forbidden.location.endsWith('/portal'));
 url=await member.post('/users',roleForm,{role:'staff'});assert.ok(url.endsWith('/portal'));assert.equal((await row('profiles',testUserId)).role,'customer');
 const direct=await member.db.rpc('set_account_role',{p_actor:actor,p_profile:testUserId,p_role:'staff'});assert.ok(direct.error);
 url=await admin.post('/users',roleForm,{role:'staff'});assert.ok(url.includes('ok='),url);
 assert.equal((await row('profiles',testUserId)).role,'staff');
 const authUser=check(await service.auth.admin.getUserById(testUserId));assert.equal(authUser.user.app_metadata.role,'staff');
 assert.equal((await member.get('/customers?q='+encodeURIComponent(email))).status,200);
 forbidden=await member.get('/users');assert.ok(forbidden.location.endsWith('/dashboard'));
 const balance=await member.db.rpc('customer_balance',{p_customer_id:customer.id});assert.equal(Number(check(balance)),207);
 page=await admin.get('/users?q='+encodeURIComponent(userEmail));
 url=await admin.post('/users',forms(page.html).find(f=>f.includes(testUserId)&&f.includes('Save role')),{role:'customer'});assert.ok(url.includes('ok='));
 assert.equal((await row('profiles',testUserId)).role,'customer');assert.equal(check(await service.auth.admin.getUserById(testUserId)).user.app_metadata.role,'customer');assert.equal((await row('customers',contact.id)).user_id,testUserId);
 assert.equal(Number(check(await member.db.rpc('customer_balance',{p_customer_id:customer.id}))),0,'Customer cannot read another balance');
 const self=await service.rpc('set_account_role',{p_actor:actor,p_profile:actor,p_role:'customer'});assert.ok(self.error);assert.equal((await row('profiles',actor)).role,'admin');
 console.log('PASS atomic role change, metadata sync, self-demotion guard, portal contact preservation and authorization');
 page=await admin.get('/users');const inviteForm=forms(page.html).find(f=>f.includes('Send invitation'));
 url=await admin.post('/users',inviteForm,{full_name:'Invalid invite',email:'bad',role:'staff'});assert.ok(url.includes('err='));
 url=await admin.post('/users',inviteForm,{full_name:'Existing account',email:userEmail,role:'staff'});assert.ok(url.includes('err='));
 const guest=session();assert.equal((await guest.get('/accept-invite')).status,200);
 console.log('PASS invitation input/duplicate guards and public acceptance route (no email sent)');
 console.log('Phase 2 integration checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 for(const table of ['invoices','subscriptions','plans','customers'])if(created[table].length){const r=await service.from(table).delete().in('id',created[table]);if(r.error){console.error('Cleanup failed',table,r.error.message);process.exitCode=1;}}
 if(testUserId){const r=await service.auth.admin.deleteUser(testUserId);if(r.error){console.error('Account cleanup failed',r.error.message);process.exitCode=1;}}
});
