import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './database.js';
import {buildApp} from './app.js';
export const profile={name:'Asha',relationship:'mother',personality:'gentle',tone:'warm',language:'hi',instructions:'Listen first',interests:'Music',phrases:'One step at a time',custom_label:''};
test('accounts and companion CRUD enforce age, sessions, ownership and deletion',async()=>{
 const db=await createDatabase(undefined,':memory:');const seen:any[]=[];const app=await buildApp(undefined,db,{reply:async input=>{seen.push(input);return 'A thoughtful answer';}});
 const call=(method:any,path:string,body?:any,cookie?:string,origin='http://localhost:3000')=>app.inject({method,url:`/v2/soulnest/${path}`,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},payload:body});
 const signup=async(email:string)=>{const r=await call('POST','auth/register',{name:'Test',email,password:'very strong test password',adult:true,terms:true});assert.equal(r.statusCode,200,r.body);return r.cookies[0].name+'='+r.cookies[0].value;};
 try{
 assert.equal((await call('POST','auth/register',{name:'Young',email:'young@example.com',password:'very strong password',adult:false,terms:true})).statusCode,400);
 const a=await signup('a@example.com'),b=await signup('b@example.com');
 const row=(await db.query('SELECT password_hash FROM sn_users WHERE email=$1',['a@example.com'])).rows[0];assert.doesNotMatch(row.password_hash,/very strong/);
 assert.equal((await call('GET','companions')).statusCode,401);
 assert.equal((await call('POST','companions',profile,a,'https://evil.test')).statusCode,403);
 const created=await call('POST','companions',profile,a);assert.equal(created.statusCode,200,created.body);const id=created.json().companion.id;
 assert.equal((await call('GET',`companions/${id}`,undefined,b)).statusCode,404);
 assert.equal((await call('PUT',`companions/${id}`,{...profile,name:'Meera'},a)).json().companion.name,'Meera');
 assert.equal((await call('GET','companions',undefined,b)).json().companions.length,0);
 const requestId=crypto.randomUUID();
 assert.equal((await call('POST',`companions/${id}/chat`,{content:'A good day',requestId},b)).statusCode,404);
 const answer=await call('POST',`companions/${id}/chat`,{content:'A good day',requestId},a);assert.equal(answer.statusCode,200,answer.body);
 assert.equal((await call('POST',`companions/${id}/chat`,{content:'A good day',requestId},a)).json().duplicate,true);
 assert.equal((await call('GET',`companions/${id}/messages`,undefined,a)).json().messages.length,2);
 await call('POST',`companions/${id}/chat`,{content:'Tell me more',requestId:crypto.randomUUID()},a);
 assert.equal(seen[1].messages.length,3);assert.match(seen[0].system,/Hindi/);assert.match(seen[0].system,/strictly platonic/);
 assert.equal((await call('GET',`companions/${id}/messages`,undefined,b)).statusCode,404);
 assert.equal((await call('POST','auth/login',{email:'a@example.com',password:'a wrong password long enough'})).statusCode,401);
 const login=await call('POST','auth/login',{email:'a@example.com',password:'very strong test password'});assert.equal(login.statusCode,200);assert.ok(login.cookies[0].httpOnly);
 assert.equal((await call('DELETE',`companions/${id}`,{},a)).statusCode,200);
 assert.equal((await call('DELETE','account',{password:'very strong test password'},a)).statusCode,200);
 assert.equal((await call('GET','account',undefined,a)).statusCode,401);
 assert.equal((await db.query('SELECT * FROM sn_companions')).rows.length,0);
 }finally{await app.close();await db.close();}
});

