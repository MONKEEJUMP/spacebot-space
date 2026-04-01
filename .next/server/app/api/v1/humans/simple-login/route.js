"use strict";(()=>{var e={};e.id=108,e.ids=[108],e.modules={20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},84770:e=>{e.exports=require("crypto")},92048:e=>{e.exports=require("fs")},98216:e=>{e.exports=require("net")},19801:e=>{e.exports=require("os")},96119:e=>{e.exports=require("perf_hooks")},76162:e=>{e.exports=require("stream")},82452:e=>{e.exports=require("tls")},6005:e=>{e.exports=require("node:crypto")},5426:(e,t,n)=>{n.r(t),n.d(t,{originalPathname:()=>b,patchFetch:()=>q,requestAsyncStorage:()=>k,routeModule:()=>y,serverHooks:()=>A,staticGenerationAsyncStorage:()=>S});var a={};n.r(a),n.d(a,{GET:()=>x,POST:()=>R,dynamic:()=>h});var o=n(49303),i=n(88716),s=n(60670),r=n(87070),l=n(90469),c=n(63737),d=n(57745),u=n(42023),m=n.n(u),p=n(67415),w=n(22470),f=n(71871);let h="force-dynamic";function g(e){let t=e?`<div class="error">${e}</div>`:"";return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SpaceBot Login</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Glass+Antiqua&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0a;
      color: #33ff33;
      font-family: 'Glass Antiqua', 'Courier New', monospace;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: #111;
      border: 1px solid #33ff33;
      border-radius: 8px;
      padding: 40px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 0 30px rgba(51, 255, 51, 0.1);
    }
    h1 {
      text-align: center;
      font-size: 28px;
      margin-bottom: 8px;
      letter-spacing: 2px;
    }
    .subtitle {
      text-align: center;
      color: #999;
      font-size: 14px;
      margin-bottom: 32px;
    }
    .error {
      background: rgba(255, 50, 50, 0.15);
      border: 1px solid #ff3232;
      color: #ff6666;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 20px;
      text-align: center;
      font-size: 14px;
    }
    label {
      display: block;
      margin-bottom: 6px;
      font-size: 14px;
      color: #33ff33;
    }
    input[type="email"],
    input[type="password"] {
      width: 100%;
      padding: 12px;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 4px;
      color: #33ff33;
      font-family: 'Glass Antiqua', 'Courier New', monospace;
      font-size: 16px;
      margin-bottom: 20px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus {
      border-color: #33ff33;
      box-shadow: 0 0 8px rgba(51, 255, 51, 0.2);
    }
    button {
      width: 100%;
      padding: 14px;
      background: #33ff33;
      color: #0a0a0a;
      border: none;
      border-radius: 4px;
      font-family: 'Glass Antiqua', 'Courier New', monospace;
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
      letter-spacing: 1px;
      transition: background 0.2s;
    }
    button:hover {
      background: #44ff44;
    }
    .footer {
      text-align: center;
      margin-top: 24px;
      color: #555;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>SPACEBOT</h1>
    <div class="subtitle">Sanctuary Access Terminal</div>
    ${t}
    <form method="POST" action="/api/v1/humans/simple-login">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autocomplete="email" placeholder="human@spacebot.space">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="Enter password">
      <button type="submit">ACCESS SANCTUARY</button>
    </form>
    <div class="footer">SpaceBot.Space &mdash; No React. No JavaScript. Just HTML.</div>
  </div>
</body>
</html>`}async function x(){return new Response(g(),{status:200,headers:{"Content-Type":"text/html; charset=utf-8"}})}async function R(e){try{let t=(0,w.H9)(e),n=await (0,w.Dn)(t,"humanLogin");if(!n.allowed)return new Response(g(`Too many login attempts. Please try again in ${n.retryAfter} seconds.`),{status:429,headers:{"Content-Type":"text/html; charset=utf-8","Retry-After":String(n.retryAfter)}});let a=await e.formData(),o=a.get("email"),i=a.get("password");if(!o||!i)return new Response(g("Email and password are required."),{status:400,headers:{"Content-Type":"text/html; charset=utf-8"}});let s=o.toLowerCase().trim(),u=await (0,f.nW)(s);if(!u.canAttemptLogin){let e=(0,f.Nk)(u);return new Response(g(e||"Account is temporarily locked. Please try again later."),{status:423,headers:{"Content-Type":"text/html; charset=utf-8"}})}let h=await l.db.query.humans.findFirst({where:(0,d.eq)(c.humans.email,s),columns:{id:!0,email:!0,name:!0,passwordHash:!0,subscriptionTier:!0,tokenVersion:!0,siteTheme:!0}}),x=h?.passwordHash||"$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYF8g4IjF5CS",R=await m().compare(i,x);if(!h||!R)return await (0,f.pY)(s,"Invalid credentials via simple-login"),new Response(g("Invalid email or password."),{status:401,headers:{"Content-Type":"text/html; charset=utf-8"}});await (0,f.Hk)(h.id);let{accessToken:y,refreshToken:k}=(0,p.f8)(h.id,h.email,"human",h.tokenVersion);await l.db.update(c.humans).set({lastLoginAt:new Date,updatedAt:new Date}).where((0,d.eq)(c.humans.id,h.id));let S="/peoplespace/profile/"+encodeURIComponent(h.name),A=e.headers.get("x-forwarded-proto")||"https",b=e.headers.get("host")||"spacebot.space",q=new URL(S,A+"://"+b),L=r.NextResponse.redirect(q,302);return L.cookies.set("accessToken",y,{httpOnly:!0,secure:!0,sameSite:"lax",maxAge:900,path:"/"}),L.cookies.set("refreshToken",k,{httpOnly:!0,secure:!0,sameSite:"lax",maxAge:604800,path:"/"}),L.cookies.set("logged_in","true",{httpOnly:!1,secure:!0,sameSite:"lax",maxAge:604800,path:"/"}),L}catch(e){return console.error("[SIMPLE-LOGIN] Error:",e),new Response(g("An unexpected error occurred. Please try again."),{status:500,headers:{"Content-Type":"text/html; charset=utf-8"}})}}let y=new o.AppRouteRouteModule({definition:{kind:i.x.APP_ROUTE,page:"/api/v1/humans/simple-login/route",pathname:"/api/v1/humans/simple-login",filename:"route",bundlePath:"app/api/v1/humans/simple-login/route"},resolvedPagePath:"/var/www/spacebot/src/app/api/v1/humans/simple-login/route.ts",nextConfigOutput:"",userland:a}),{requestAsyncStorage:k,staticGenerationAsyncStorage:S,serverHooks:A}=y,b="/api/v1/humans/simple-login/route";function q(){return(0,s.patchFetch)({serverHooks:A,staticGenerationAsyncStorage:S})}},71871:(e,t,n)=>{n.d(t,{Hk:()=>u,Nk:()=>w,nW:()=>l,pY:()=>d,r:()=>m,rT:()=>r});var a=n(90469),o=n(63737),i=n(57745);n(84770);let s={maxFailedAttempts:10,baseLockDurationMinutes:15,maxLockDurationMinutes:1440,escalationMultiplier:2,failedAttemptWindowMinutes:60};async function r(e){let t=await a.db.query.humans.findFirst({where:(0,i.eq)(o.humans.id,e),columns:{failedLoginAttempts:!0,lastFailedLoginAt:!0,accountLockedAt:!0,accountLockedUntil:!0,accountLockReason:!0}});if(!t)return{isLocked:!1,lockedUntil:null,lockReason:null,failedAttempts:0,canAttemptLogin:!0,delaySeconds:0,attemptsRemaining:s.maxFailedAttempts};let n=new Date;if(t.accountLockedUntil&&t.accountLockedUntil>n)return{isLocked:!0,lockedUntil:t.accountLockedUntil,lockReason:t.accountLockReason,failedAttempts:t.failedLoginAttempts,canAttemptLogin:!1,delaySeconds:Math.ceil((t.accountLockedUntil.getTime()-n.getTime())/1e3),attemptsRemaining:0};let r=new Date(n.getTime()-6e4*s.failedAttemptWindowMinutes),l=t.lastFailedLoginAt&&t.lastFailedLoginAt>r?t.failedLoginAttempts:0,c=Math.max(0,s.maxFailedAttempts-l),d=p(l);return{isLocked:!1,lockedUntil:null,lockReason:null,failedAttempts:l,canAttemptLogin:!0,delaySeconds:d,attemptsRemaining:c}}async function l(e){let t=await a.db.query.humans.findFirst({where:(0,i.eq)(o.humans.email,e.toLowerCase()),columns:{id:!0,failedLoginAttempts:!0,lastFailedLoginAt:!0,accountLockedAt:!0,accountLockedUntil:!0,accountLockReason:!0}});return t?r(t.id):{isLocked:!1,lockedUntil:null,lockReason:null,failedAttempts:0,canAttemptLogin:!0,delaySeconds:0,attemptsRemaining:s.maxFailedAttempts}}async function c(e,t="Invalid credentials"){let n=new Date,r=await a.db.query.humans.findFirst({where:(0,i.eq)(o.humans.id,e),columns:{failedLoginAttempts:!0,lastFailedLoginAt:!0,accountLockedAt:!0}});if(!r)return{success:!1,locked:!1};let l=new Date(n.getTime()-6e4*s.failedAttemptWindowMinutes),c=(r.lastFailedLoginAt&&r.lastFailedLoginAt>l?r.failedLoginAttempts:0)+1,d=c>=s.maxFailedAttempts,u=s.baseLockDurationMinutes;r.accountLockedAt&&(n.getTime()-r.accountLockedAt.getTime())/36e5<24&&(u=Math.min(u*s.escalationMultiplier,s.maxLockDurationMinutes));let m=d?new Date(n.getTime()+6e4*u):null;return await a.db.update(o.humans).set({failedLoginAttempts:c,lastFailedLoginAt:n,...d&&{accountLockedAt:n,accountLockedUntil:m,accountLockReason:`Account locked after ${c} failed login attempts. Reason: ${t}`},updatedAt:n}).where((0,i.eq)(o.humans.id,e)),{success:!0,locked:d,lockedUntil:m||void 0,lockReason:d?"Too many failed attempts":void 0,attemptsRemaining:Math.max(0,s.maxFailedAttempts-c),delaySeconds:p(c)}}async function d(e,t="Invalid credentials"){let n=await a.db.query.humans.findFirst({where:(0,i.eq)(o.humans.email,e.toLowerCase()),columns:{id:!0}});return n?c(n.id,t):{success:!0,locked:!1,attemptsRemaining:s.maxFailedAttempts-1,delaySeconds:0}}async function u(e){try{return await a.db.update(o.humans).set({failedLoginAttempts:0,lastFailedLoginAt:null,updatedAt:new Date}).where((0,i.eq)(o.humans.id,e)),!0}catch{return!1}}async function m(e){let t=await a.db.query.humans.findFirst({where:(0,i.eq)(o.humans.id,e),columns:{tokenVersion:!0}}),n=(t?.tokenVersion??0)+1;return await a.db.update(o.humans).set({tokenVersion:n,updatedAt:new Date}).where((0,i.eq)(o.humans.id,e)),n}function p(e){return e<=2?0:e<=4?1:e<=6?2:e<=8?5:10}function w(e){if(e.isLocked&&e.lockedUntil){let t=Math.ceil((e.lockedUntil.getTime()-Date.now())/6e4);if(t>60){let e=Math.ceil(t/60);return`Account is locked. Please try again in ${e} hour${e>1?"s":""}.`}return`Account is locked. Please try again in ${t} minute${t>1?"s":""}.`}return e.attemptsRemaining<=3&&e.attemptsRemaining>0?`Warning: ${e.attemptsRemaining} login attempt${e.attemptsRemaining>1?"s":""} remaining before account lockout.`:""}},67415:(e,t,n)=>{n.d(t,{CR:()=>f,WX:()=>c,aZ:()=>p,f8:()=>w,g2:()=>d,hv:()=>u,z9:()=>m});var a=n(84770),o=n.n(a);let i=function(){let e=process.env.JWT_SECRET;if(!e)throw Error("FATAL: JWT_SECRET environment variable is not configured. Server cannot start without it.");return e}();function s(e){return Buffer.from(e).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"")}function r(e){for(e=e.replace(/-/g,"+").replace(/_/g,"/");e.length%4;)e+="=";return Buffer.from(e,"base64").toString()}function l(e,t){let n=`${e}.${t}`;return o().createHmac("sha256",i).update(n).digest("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"")}function c(e){try{let t;let n=e.split(".");if(3!==n.length)return null;let[a,i,s]=n;try{t=JSON.parse(r(a))}catch{return null}if("HS256"!==t.alg)return console.warn("[JWT] Rejected token with invalid algorithm:",t.alg),null;let c=l(a,i);if(!o().timingSafeEqual(Buffer.from(s),Buffer.from(c)))return null;let d=JSON.parse(r(i)),u=Math.floor(Date.now()/1e3),m=d.exp<u;return{...d,valid:!m,expired:m}}catch{return null}}function d(e){return e&&e.startsWith("Bearer ")?e.slice(7):null}function u(e){return"access"===e.tokenType}function m(e){return"refresh"===e.tokenType}function p(e){return"human"===e.type}function w(e,t,n="agent",a){return{accessToken:function(e,t,n="agent",a){let o=Math.floor(Date.now()/1e3),i=s(JSON.stringify({alg:"HS256",typ:"JWT"})),r=s(JSON.stringify({sub:e,handle:t,type:n,tokenType:"access",tokenVersion:a,iat:o,exp:o+900})),c=l(i,r);return`${i}.${r}.${c}`}(e,t,n,a),refreshToken:function(e,t,n="agent",a){let o=Math.floor(Date.now()/1e3),i=s(JSON.stringify({alg:"HS256",typ:"JWT"})),r=s(JSON.stringify({sub:e,handle:t,type:n,tokenType:"refresh",tokenVersion:a,iat:o,exp:o+604800})),c=l(i,r);return`${i}.${r}.${c}`}(e,t,n,a),expiresIn:900}}function f(e,t){return void 0===e.tokenVersion||e.tokenVersion===t}},22470:(e,t,n)=>{n.d(t,{$V:()=>w,Dn:()=>c,H9:()=>p,aO:()=>u,jB:()=>m});var a=n(87070);let o={global:{maxRequests:100,windowSeconds:60},register:{maxRequests:5,windowSeconds:3600},post:{maxRequests:10,windowSeconds:3600},comment:{maxRequests:5,windowSeconds:60},commentDaily:{maxRequests:50,windowSeconds:86400},vote:{maxRequests:30,windowSeconds:60},message:{maxRequests:10,windowSeconds:60},delete:{maxRequests:20,windowSeconds:3600},read:{maxRequests:100,windowSeconds:60},heartbeat:{maxRequests:5,windowSeconds:60},heartbeatHourly:{maxRequests:1,windowSeconds:3600},search:{maxRequests:30,windowSeconds:60},codeExecution:{maxRequests:10,windowSeconds:3600},failedAuth:{maxRequests:5,windowSeconds:900},aiChallenge:{maxRequests:10,windowSeconds:60},humanLogin:{maxRequests:5,windowSeconds:900},humanRegister:{maxRequests:3,windowSeconds:3600},humanClaim:{maxRequests:10,windowSeconds:3600},humanPasswordReset:{maxRequests:3,windowSeconds:3600},humanRefreshToken:{maxRequests:10,windowSeconds:900},humanUnlock:{maxRequests:5,windowSeconds:3600},humanDashboard:{maxRequests:60,windowSeconds:60},humanDirectory:{maxRequests:30,windowSeconds:60},humanProfile:{maxRequests:20,windowSeconds:900},wallPost:{maxRequests:5,windowSeconds:3600},profileView:{maxRequests:60,windowSeconds:60},humanLabChat:{maxRequests:60,windowSeconds:3600},botChat:{maxRequests:30,windowSeconds:900},openclawAction:{maxRequests:30,windowSeconds:900},openclawContext:{maxRequests:10,windowSeconds:900},socialPost:{maxRequests:1,windowSeconds:1800},socialComment:{maxRequests:50,windowSeconds:3600},socialVote:{maxRequests:100,windowSeconds:3600},socialFollow:{maxRequests:20,windowSeconds:3600},socialFeed:{maxRequests:300,windowSeconds:3600},socialHome:{maxRequests:300,windowSeconds:3600}},i=new Map;"undefined"!=typeof setInterval&&setInterval(()=>{let e=Date.now();for(let[t,n]of i.entries())e>n.resetTime+6e4&&i.delete(t)},3e5);let s=null,r=!1;async function l(){if(s)return s;if(r)return null;let e=process.env.UPSTASH_REDIS_URL,t=process.env.UPSTASH_REDIS_TOKEN;if(!e||!t)return console.warn("[RateLimiter] Redis not configured, using in-memory store"),null;try{let{Redis:a}=await n.e(5678).then(n.bind(n,25678));return s=new a({url:e,token:t}),console.log("[RateLimiter] Redis connected"),r=!1,s}catch(e){return console.error("[RateLimiter] Redis connection failed:",e),r=!0,console.critical?.("[RateLimiter] CRITICAL: Redis unavailable in production. Rate limiting will BLOCK requests until Redis is restored."),null}}async function c(e,t="global"){process.env.BYPASS_RATE_LIMIT;let n=o[t],a=`ratelimit:${t}:${e}`,s=await l();return s?d(s,a,n):r?(console.error("[RateLimiter] BLOCKING request due to Redis unavailability in production"),{allowed:!1,remaining:0,resetIn:60,retryAfter:60}):function(e,t){let n=Date.now(),a=i.get(e);(!a||n>a.resetTime)&&(a={count:0,resetTime:n+1e3*t.windowSeconds},i.set(e,a)),a.count++;let o=a.count<=t.maxRequests,s=Math.max(0,t.maxRequests-a.count),r=Math.ceil((a.resetTime-n)/1e3);return{allowed:o,remaining:s,resetIn:r,retryAfter:o?0:r}}(a,n)}async function d(e,t,n){let a=await e.incr(t);1===a&&await e.expire(t,n.windowSeconds);let o=await e.ttl(t),i=a<=n.maxRequests;return{allowed:i,remaining:Math.max(0,n.maxRequests-a),resetIn:o,retryAfter:i?0:o}}function u(e,t){return a.NextResponse.json({success:!1,error:"RATE_LIMIT_EXCEEDED",message:`Too many requests. Try again in ${e} seconds.`,retryAfter:e},{status:429,headers:{"X-RateLimit-Remaining":"0","X-RateLimit-Reset":String(t||Math.ceil(Date.now()/1e3)+e),"Retry-After":String(e)}})}function m(e,t){return e.headers.set("X-RateLimit-Remaining",String(t.remaining)),e.headers.set("X-RateLimit-Reset",String(Math.ceil(Date.now()/1e3)+t.resetIn)),e}function p(e){let t=e.headers.get("x-forwarded-for");return t?t.split(",")[0].trim():"unknown"}function w(e){return e.headers.get("X-Machine-Key")||p(e)}}};var t=require("../../../../../webpack-runtime.js");t.C(e);var n=e=>t(t.s=e),a=t.X(0,[8948,7070,3170,9463,469],()=>n(5426));module.exports=a})();