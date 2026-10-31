/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const compiled = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, require: name => { if (name in mocks) return mocks[name]; throw Error('Unexpected import '+name); }, process, URL, URLSearchParams });
  return compiled.exports;
}
const { acceptInvitation } = load('src/lib/invitations.ts');
for (const [path, method, expected] of [
  ['#access_token=access&refresh_token=refresh', 'setSession', {access_token:'access',refresh_token:'refresh'}],
  ['?code=one-time', 'exchangeCodeForSession', 'one-time'],
  ['?token_hash=hashed', 'verifyOtp', {token_hash:'hashed',type:'invite'}],
]) test('invitation accepts '+method, async()=>{
  let calls=0;
  await acceptInvitation({auth:{[method]:async value=>{calls++;assert.equal(JSON.stringify(value),JSON.stringify(expected));return {data:{session:{user:{id:'invited'}}},error:null}}}},'https://app.example/accept-invite'+path);
  assert.equal(calls,1);
});
test('missing, expired and incomplete invitation links fail',async()=>{
  for(const path of ['', '#error=access_denied', '#access_token=only-one']) await assert.rejects(acceptInvitation({auth:{}},'https://app.example/accept-invite'+path));
  await assert.rejects(acceptInvitation({auth:{verifyOtp:async()=>({data:{session:null},error:{message:'expired'}})}},'https://app.example/accept-invite?token_hash=expired'));
});
function actions({roleError=false, readinessError=false, deny=false}={}) {
  const calls=[];
  const admin={
    from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})}),
    rpc:async(name,args)=>{calls.push([name,args]);return {error:readinessError||roleError&&args.p_profile==='invited' ? {message:'role unavailable'} : null}},
    auth:{admin:{inviteUserByEmail:async(email,options)=>{calls.push(['invite',email,options]);return {data:{user:{id:'invited'}},error:null}}}},
  };
  const api=load('src/app/(app)/users/actions.ts',{
    'next/cache':{revalidatePath:path=>calls.push(['revalidate',path])},
    '@/lib/auth':{requireRole:async role=>{assert.equal(role,'admin');if(deny)throw Error('denied');return {id:'actor',role:'admin'}}},
    '@/lib/flash':{str:(f,k)=>String(f.get(k)||'').trim(),flash:(path,kind,message)=>{throw Object.assign(Error(message),{kind,path})}},
    '@/lib/supabase/admin':{createAdminClient:()=>{calls.push(['admin']);return admin}},
    '@/lib/validation':{EMAIL_RE:/^[^@]+@[^@]+\.[^@]+$/},
  });
  return {api,calls};
}
function inviteForm(){return new Map([['email','NEW@EXAMPLE.COM'],['full_name','New teammate'],['role','staff']]);}
test('invite action sends email and assigns trusted metadata through atomic RPC',async()=>{
  const old=process.env.NEXT_PUBLIC_SITE_URL;process.env.NEXT_PUBLIC_SITE_URL='https://app.example';
  try{const {api,calls}=actions();await assert.rejects(api.inviteStaff(inviteForm()),e=>e.kind==='ok');
    const email=calls.find(c=>c[0]==='invite');assert.equal(email[1],'new@example.com');assert.equal(email[2].redirectTo,'https://app.example/accept-invite');assert.equal(email[2].data.full_name,'New teammate');assert.equal(email[2].password,undefined);
    assert.ok(calls.some(c=>c[0]==='set_account_role'&&c[1].p_profile==='invited'&&c[1].p_role==='staff'&&c[1].p_actor==='actor'));
  }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=old;}
});
test('missing role migration prevents any invitation email',async()=>{
  const old=process.env.NEXT_PUBLIC_SITE_URL;process.env.NEXT_PUBLIC_SITE_URL='https://app.example';
  try{const {api,calls}=actions({readinessError:true});await assert.rejects(api.inviteStaff(inviteForm()),e=>e.kind==='err');assert.ok(!calls.some(c=>c[0]==='invite'));}finally{if(old===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=old;}
});
test('failed role provisioning reports partial invitation instead of false success',async()=>{
  const old=process.env.NEXT_PUBLIC_SITE_URL;process.env.NEXT_PUBLIC_SITE_URL='https://app.example';
  try{const {api}=actions({roleError:true});await assert.rejects(api.inviteStaff(inviteForm()),e=>e.kind==='err'&&e.message.includes('Invitation sent, but team access'));}finally{if(old===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=old;}
});
test('team actions enforce authorization before touching service client',async()=>{
  const {api,calls}=actions({deny:true});await assert.rejects(api.inviteStaff(inviteForm()));await assert.rejects(api.changeRole('target',new Map([['role','staff']])));assert.equal(calls.length,0);
});
test('self role changes and invalid roles are rejected',async()=>{
  const {api,calls}=actions();await assert.rejects(api.changeRole('actor',new Map([['role','customer']])));await assert.rejects(api.changeRole('target',new Map([['role','owner']])));assert.equal(calls.length,0);
});
