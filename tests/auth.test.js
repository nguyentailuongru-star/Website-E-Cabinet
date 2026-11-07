const test=require('node:test');const assert=require('node:assert/strict');
test('vai trò được giới hạn đúng năm loại theo GĐ1',()=>{const {ROLES}=require('../server/auth');assert.deepEqual(ROLES,['admin','chair','secretary','delegate','screen']);});
test('các vai trò là duy nhất',()=>{const {ROLES}=require('../server/auth');assert.equal(new Set(ROLES).size,5);});
test('API trả 401 khi chưa đăng nhập và 403 với vai trò không được phép',()=>{
 const {requireRole}=require('../server/auth');
 const invoke=(user,roles)=>{let status=200,body=null,next=false;const res={status(n){status=n;return this;},json(v){body=v;return this;}};requireRole(...roles)({user},res,()=>{next=true;});return{status,body,next};};
 assert.equal(invoke(null,['admin']).status,401);
 const denied=invoke({role:'delegate'},['admin']);assert.equal(denied.status,403);assert.equal(denied.next,false);
 assert.equal(invoke({role:'admin'},['admin']).next,true);
});
test('yêu cầu thay đổi dữ liệu phải có CSRF token hợp lệ',()=>{
 const {csrf}=require('../server/auth');
 const invoke=(header,token)=>{let status=200,next=false;const req={method:'POST',user:token?{csrf_token:token}:null,get:()=>header};const res={status(n){status=n;return this;},json(){return this;}};csrf(req,res,()=>{next=true;});return{status,next};};
 assert.equal(invoke('bad','good').status,403);assert.equal(invoke('good','good').next,true);
});
