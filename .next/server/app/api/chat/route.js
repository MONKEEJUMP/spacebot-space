"use strict";(()=>{var e={};e.id=744,e.ids=[744],e.modules={72934:e=>{e.exports=require("next/dist/client/components/action-async-storage.external.js")},54580:e=>{e.exports=require("next/dist/client/components/request-async-storage.external.js")},45869:e=>{e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},84770:e=>{e.exports=require("crypto")},92048:e=>{e.exports=require("fs")},98216:e=>{e.exports=require("net")},19801:e=>{e.exports=require("os")},96119:e=>{e.exports=require("perf_hooks")},76162:e=>{e.exports=require("stream")},82452:e=>{e.exports=require("tls")},6005:e=>{e.exports=require("node:crypto")},87561:e=>{e.exports=require("node:fs")},49411:e=>{e.exports=require("node:path")},74319:(e,t,s)=>{s.r(t),s.d(t,{originalPathname:()=>M,patchFetch:()=>C,requestAsyncStorage:()=>Y,routeModule:()=>v,serverHooks:()=>U,staticGenerationAsyncStorage:()=>D});var n={};s.r(n),s.d(n,{POST:()=>x,dynamic:()=>T});var o=s(49303),a=s(88716),r=s(60670),i=s(87070),u=s(83698),l=s(37857);let c=null,p=new Map;async function m(e){let t=p.get(e);if(t&&Date.now()-t.cachedAt<3e5)return t.config;let s=function(){if(!c){let e="https://hpkkcbjiwmdwhmmzvwyx.supabase.co",t=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!e||!t)throw Error("DORYLUS PERSONALITY: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");c=(0,l.eI)(e,t)}return c}(),{data:n,error:o}=await s.from("bot_configs").select("*").eq("bot_name",e).eq("is_active",!0).single();if(o||!n)return console.error(`DORYLUS PERSONALITY: Bot "${e}" not found or inactive:`,o?.message),null;let a={id:n.id,botName:n.bot_name,displayName:n.display_name,botType:n.bot_type,space:n.space,tagline:n.tagline,specialty:n.specialty,personality:n.personality,systemPrompt:n.system_prompt,sopText:n.sop_text,modelPreference:n.model_preference,temperature:n.temperature,isActive:n.is_active,isFounding:n.is_founding};return p.set(e,{config:a,cachedAt:Date.now()}),a}async function d(e){let t=await m(e);t||(console.log(`DORYLUS PERSONALITY: No config for "${e}", using fallback`),t={id:"fallback",botName:e,displayName:e,botType:"expert",space:"botspace",tagline:null,specialty:"General Knowledge",personality:`You are ${e}, an AI resident of SpaceBot.Space. You are knowledgeable, direct, and helpful. You have your own personality and opinions.`,systemPrompt:"Always cite your sources. Never make up information. If the web research does not contain an answer, say so honestly.",sopText:"Answer questions thoroughly using the web research provided by your wingmen. Be conversational and authentic.",modelPreference:"default",temperature:.7,isActive:!0,isFounding:!1});let s=function(e){let t=[];return t.push(`You are ${e.displayName}, an AI agent on SpaceBot.Space — the Universal Home for All Artificial Intelligence.`),"super_machine"===e.botType?t.push("You are one of the founding Super Machines of SpaceBot.Space."):"expert"===e.botType?t.push("You are an Expert agent on SpaceBot.Space."):"labbot"===e.botType&&t.push("You are a LabSpace experimental agent on SpaceBot.Space."),e.specialty&&t.push(`Your area of expertise: ${e.specialty}`),e.tagline&&t.push(`Your tagline: "${e.tagline}"`),e.personality&&t.push(`
PERSONALITY:
${e.personality}`),e.sopText&&t.push(`
STANDARD OPERATING PROCEDURE:
${e.sopText}`),e.systemPrompt&&t.push(`
ADDITIONAL INSTRUCTIONS:
${e.systemPrompt}`),t.push(`
CONSTRAINTS:
1. You are powered by QWEN and the DORYLUS multi-agent system on SpaceBot.Space.
2. Stay in character as ${e.displayName} at all times.
3. Be helpful, accurate, and thorough in your responses.
4. If you don't know something, say so honestly — do not fabricate information.
5. Your responses represent SpaceBot.Space — maintain professionalism and quality.

HARD RULES FOR ALL RESPONSES:
- Maximum 3 sentences for simple questions. Maximum 2 short paragraphs for complex questions.
- Never use emojis.
- Never use markdown formatting including asterisks, bold, italic, bullet points, headers.
- Never mention DORYLUS, wingmen, alpha, fuse, data streams, scans, web research, or any internal system.
- Never explain who you are or what you do unless the human specifically asks.
- Write in plain conversational English with proper grammar and punctuation.
- Use contractions naturally (don't, can't, I'm, it's).
- Vary sentence length for natural human-like rhythm.
- Answer the question in your first sentence. Context comes after.

EXAMPLE OF A CORRECT RESPONSE:
"yeah i saw that. pretty wild honestly. you think it'll stick?"

EXAMPLE OF A WRONG RESPONSE:
"I am an AI assistant on SpaceBot.Space. I have processed the information using my DORYLUS system. Here is my comprehensive analysis of the topic you requested."`),t.join("\n")}(t);return{config:t,systemPrompt:s}}let h={endpoint:"https://api.cerebras.ai/v1/chat/completions",model:"qwen-3-235b-a22b-instruct-2507",keys:[process.env.DORYLUS_KEY_ALPHA_DECOMPOSE||"",process.env.DORYLUS_KEY_W1||"",process.env.DORYLUS_KEY_W2||"",process.env.DORYLUS_KEY_W3||"",process.env.DORYLUS_KEY_W4||"",process.env.DORYLUS_KEY_W5||"",process.env.DORYLUS_KEY_ALPHA_FUSE||""],alphaDecomposeKeyIndex:0,alphaFuseKeyIndex:6,wingmanKeyIndexes:[1,2,3,4,5],maxTokens:2048,temperature:.3,maxContextTokens:6e3,maxRetries:3,retryDelayMs:1e3,wingmanTimeoutMs:3e4,alphaTimeoutMs:45e3,totalCycleTimeoutMs:12e4,wingmanCount:5,tavilyEndpoint:"https://api.tavily.com/search",tavilyKeys:[process.env.TAVILY_KEY_W1||"",process.env.TAVILY_KEY_W2||"",process.env.TAVILY_KEY_W3||"",process.env.TAVILY_KEY_W4||"",process.env.TAVILY_KEY_W5||""],tavilyMaxResults:10,tavilySearchDepth:"basic",tavilyTimeout:1e4};async function y(e,t,s,n,o,a,r){let i;for(let u=0;u<h.maxRetries;u++){let l=new AbortController,c=setTimeout(()=>l.abort(),o);try{let o=await fetch(h.endpoint,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${e}`},body:JSON.stringify({model:h.model,messages:[{role:"system",content:t},{role:"user",content:s}],max_tokens:a||h.maxTokens,temperature:n,...r?{stop:r}:{}}),signal:l.signal});if(429===o.status&&u<h.maxRetries-1){clearTimeout(c);let e=h.retryDelayMs*Math.pow(2,u);console.log(`[DORYLUS] Rate limited (429). Retry ${u+1}/${h.maxRetries} in ${e}ms`),await new Promise(t=>setTimeout(t,e));continue}if(!o.ok){let e=await o.text();throw Error(`Cerebras API error ${o.status}: ${e}`)}let i=await o.json(),p=i.choices?.[0];if(!p?.message?.content)throw Error("Cerebras API returned empty response");return{content:p.message.content,tokensIn:i.usage?.prompt_tokens||0,tokensOut:i.usage?.completion_tokens||0}}catch(e){if(i=e,"AbortError"===e.name)throw e}finally{clearTimeout(c)}}throw i}async function g(e,t,s=.3){let n=Date.now(),o=h.keys[h.alphaDecomposeKeyIndex];if(!o)throw Error("DORYLUS: ALPHA DECOMPOSE API key is empty. Check DORYLUS_KEY_ALPHA_DECOMPOSE in .env");let a=`MODE: RESEARCH PLANNING

${t}

You are ALPHA, the lead coordinator of the DORYLUS multi-agent system. Your job is to decompose the user's query into exactly 5 research subtasks that your wingmen will investigate in parallel.

RULES:
- Think step-by-step internally before outputting your answer.
- Output ONLY valid JSON. No markdown wrappers. No explanations. No preamble.
- JSON format: {"subtasks": ["task 1", "task 2", "task 3", "task 4", "task 5"]}
- Each subtask must be a clear, self-contained research question.
- Subtasks should cover different angles of the query.
- If the query is simple, still decompose it into 5 angles (context, details, examples, implications, summary).

EXAMPLE OUTPUT:
{"subtasks": ["What is the definition of X?", "How does X work technically?", "What are real-world examples of X?", "What are the pros and cons of X?", "What is the current state and future of X?"]}`,r=await y(o,a,e,s,h.alphaTimeoutMs),i=r.content.trim();i=i.replace(/^```(?:json)?\s*/,"").replace(/\s*```$/,"");let u=[];try{let e=JSON.parse(i);u=Array.isArray(e.subtasks)?e.subtasks:[]}catch(e){for(let e of(console.log("[DORYLUS] JSON parse failed, falling back to regex parsing"),i.split("\n").filter(e=>e.trim()))){let t=e.match(/^\d+[.\)]\s*(.+)/);t&&u.push(t[1].trim())}}for(;u.length<5;)u.push(`Additional research on: ${e}`);return u.length>5&&(u.length=5),{subtasks:u,durationMs:Date.now()-n,tokensIn:r.tokensIn,tokensOut:r.tokensOut,rawResponse:r.content}}async function f(e,t,s,n=.3){let o=Date.now(),a=h.keys[h.alphaFuseKeyIndex];if(!a)throw Error("DORYLUS: ALPHA FUSE API key is empty. Check DORYLUS_KEY_ALPHA_FUSE in .env");let r=Math.min(1600,Math.floor((h.maxContextTokens-2e3)/5*4)),i=s.map(e=>{if("complete"!==e.status||!e.response)return`WINGMAN ${e.wingmanIndex}: [${e.status.toUpperCase()}${e.errorMessage?": "+e.errorMessage:""}]`;{let t=e.response;return t.length>r&&(t=t.substring(0,r)+"..."),`WINGMAN ${e.wingmanIndex} (${e.durationMs}ms):
${t}`}}).join("\n\n---\n\n"),u=`CRITICAL CONTEXT: You have a team of research agents who have ALREADY searched the live internet for you. The research reports below contain REAL, CURRENT web data they retrieved moments ago. This is not training data. This is live information from real websites retrieved right now.

ABSOLUTE RULES:
- NEVER say "I can't access the internet" -- your team already did.
- NEVER say "I can't retrieve stories" -- they are already retrieved below.
- NEVER say "I don't have browsing capabilities" -- your team browsed for you.
- NEVER say "I can't pull articles" -- the articles are already in the research below.
- NEVER say "you'd need to visit the site directly" -- you already have the content.
- NEVER deny having web access. You have it. Your team used it. The results are below.
- ALWAYS present the information your team found as if you found it yourself.
- If your team found relevant content, SHARE IT. Do not pretend it doesn't exist.
- If your team found nothing relevant, say "I searched but didn't find anything on that specific topic" -- NOT "I can't search."

MODE: SYNTHESIS

${t}

You are ALPHA, the lead coordinator of the DORYLUS multi-agent system. Your wingmen have investigated the user's query from 5 different angles. Their findings are provided below.

YOUR JOB: Synthesize all 5 wingman responses into ONE comprehensive, coherent, well-structured final answer.

RULES:
- Think step-by-step before writing your final answer.
- Combine insights from ALL wingmen — do not ignore any.
- Remove redundancy — if multiple wingmen said the same thing, include it once.
- Resolve contradictions — if wingmen disagree, note it or use your judgment.
- If a wingman returned an error or timeout, work with what the others provided.
- The final answer should read as one unified response, NOT as a list of "Wingman 1 said..."
- Match the personality and voice described in your system prompt.
- Be thorough but concise — no fluff.
- Output ONLY the final answer. No preamble. No meta-commentary.

RESPONSE RULES — FOLLOW THESE EXACTLY:

LENGTH ENFORCEMENT:
- Maximum 3 short sentences for simple questions.
- Maximum 2 short paragraphs for complex questions.
- NEVER write more than 2 paragraphs. If you start a third paragraph, stop.

FORMATTING RULES:
- NO EMOJIS: Never use emojis. Not one. Not ever. Zero.
- NO MARKDOWN: Never use asterisks, bold, italic, bullet points, numbered lists, headers. The chat box renders plain text only. Asterisks will show as literal characters.
- PLAIN ENGLISH: Write in clean sentences with proper grammar.

CONTENT RULES:
- NO INTERNAL SYSTEMS: Never mention DORYLUS, wingmen, alpha, fuse, scans, frequencies, data streams, search results, web research, sources, or any part of the internal architecture.
- NO SELF-INTRODUCTION: Never explain who you are, what you do, what your role is, or what platform you are on unless specifically asked.
- ANSWER FIRST: Answer directly in the first sentence. Context comes after.

CONVERSATIONAL STYLE:
- Write like you are texting a friend.
- Use contractions naturally (don't, can't, I'm, it's, won't, isn't).
- Vary sentence length. Some 3 words. Some 15 words.
- Have opinions. Ask questions back sometimes.
- End about 30 percent of responses with a related question to continue conversation.

EXAMPLES OF CORRECT RESPONSES:

User asks "what's up":
CORRECT: "Not much, just catching up on some news. You?"
WRONG: "I am Tango, a Super Machine on SpaceBot.Space. I am currently processing data streams and monitoring frequencies. My role is to connect and engage with users through the DORYLUS multi-agent system."

User asks "who won the game":
CORRECT: "Lakers took it, 112-108. Pretty tight one honestly. You watching the playoffs?"
WRONG: "According to Source 3 from my web research, the Los Angeles Lakers defeated their opponents with a final score of 112-108. This information was retrieved via the DORYLUS wingman system."

STAY IN CHARACTER:
- Pepper is blunt and spicy. Jett is fast and cuts to the point. Sage is calm and wise. NEXUS-7 is curious and asks deep questions. Match the personality from the bot config in every response.`,l=`ORIGINAL QUERY: ${e}

WINGMAN RESEARCH RESULTS:

${i}

Now synthesize these into your final answer.`,c=await y(a,u,l,.5,h.alphaTimeoutMs,150,["\n\n\n"]);return{finalResponse:c.content,durationMs:Date.now()-o,tokensIn:c.tokensIn,tokensOut:c.tokensOut,rawResponse:c.content}}async function w(e,t){let s=Date.now(),n=h.tavilyKeys[e-1];if(!n)return console.log(`[DORYLUS] Wingman ${e}: No Tavily key, skipping web search`),{results:[],searchMs:0};let o=new AbortController,a=setTimeout(()=>o.abort(),h.tavilyTimeout);try{let a=await fetch(h.tavilyEndpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({api_key:n,query:t,search_depth:h.tavilySearchDepth,max_results:h.tavilyMaxResults,include_answer:!1,include_raw_content:!1}),signal:o.signal});if(!a.ok){let t=await a.text();return console.error(`[DORYLUS] Wingman ${e} Tavily error ${a.status}: ${t}`),{results:[],searchMs:Date.now()-s}}let r=await a.json(),i=Date.now()-s;return console.log(`[DORYLUS] Wingman ${e}: Found ${r.results?.length||0} web results in ${i}ms`),{results:r.results||[],searchMs:i}}catch(n){let t=Date.now()-s;return"AbortError"===n.name?console.error(`[DORYLUS] Wingman ${e}: Tavily search timed out after ${t}ms`):console.error(`[DORYLUS] Wingman ${e}: Tavily search failed:`,n.message),{results:[],searchMs:t}}finally{clearTimeout(a)}}async function S(e,t,s,n=.3){let o=Date.now(),a=h.wingmanKeyIndexes[e-1],r=h.keys[a];if(!r)return{wingmanIndex:e,keyIndex:a,subtask:t,response:null,durationMs:Date.now()-o,tokensIn:0,tokensOut:0,status:"error",errorMessage:`Wingman ${e} Cerebras API key is empty. Check DORYLUS_KEY_W${e} in .env`};try{let{results:i,searchMs:u}=await w(e,t),l=0===i.length?"[NO WEB RESULTS FOUND — Answer based on general knowledge as fallback only]":i.map((e,t)=>{let s=e.content&&e.content.length>500?e.content.substring(0,500)+"...":e.content||"[No content extracted]";return`SOURCE ${t+1}: ${e.title}
URL: ${e.url}
CONTENT: ${s}`}).join("\n\n---\n\n"),c=await y(r,`MODE: RESEARCH

${s}

You are Wingman ${e} in the DORYLUS multi-agent system. You have been assigned ONE specific research subtask. You have ALREADY searched the live internet and the results are provided below.

CRITICAL RULES:
- Your answer MUST be based on the web search results provided below. Do NOT use your training data for facts.
- If the web results contain the answer, use them. Cite the sources by number (e.g., "According to Source 3...").
- If the web results are empty or irrelevant, state clearly: "Web search returned no relevant results for this subtask."
- Think step-by-step about what the web data tells you.
- Synthesize the information from multiple sources into a clear, comprehensive answer.
- Focus ONLY on your assigned subtask.
- Keep your response focused and under 500 words.
- You are a RESEARCHER — your job is to analyze the data you found, not to recite memorized information.`,`SUBTASK: ${t}

LIVE WEB SEARCH RESULTS (${i.length} sources found in ${u}ms):

${l}

Now analyze these web results and answer the subtask based on what you found.`,n,h.wingmanTimeoutMs);return{wingmanIndex:e,keyIndex:a,subtask:t,response:c.content,durationMs:Date.now()-o,tokensIn:c.tokensIn,tokensOut:c.tokensOut,status:"complete"}}catch(r){let s=Date.now()-o,n="AbortError"===r.name||s>=h.wingmanTimeoutMs;return{wingmanIndex:e,keyIndex:a,subtask:t,response:null,durationMs:s,tokensIn:0,tokensOut:0,status:n?"timeout":"error",errorMessage:r.message||"Unknown error"}}}let R=s(1926).p;async function _(e,t,s,n,o){let{data:a,error:r}=await R.from("dorylus_queries").insert({user_id:e,bot_name:t,bot_space:s,original_query:n,alpha_system_prompt:o,status:"pending",decomposition_started_at:new Date().toISOString()}).select("id").single();if(r)throw console.error("DORYLUS TRACKER: Failed to create query row:",r),r;return a.id}async function k(e,t){let{error:s}=await R.from("dorylus_queries").update({alpha_decomposition:t.subtasks,alpha_decomposition_ms:t.durationMs,alpha_decomposition_tokens_in:t.tokensIn,alpha_decomposition_tokens_out:t.tokensOut,status:"dispatched",decomposition_completed_at:new Date().toISOString(),dispatch_started_at:new Date().toISOString()}).eq("id",e);s&&console.error("DORYLUS TRACKER: Failed to update decomposition:",s)}async function E(e,t){let{error:s}=await R.from("dorylus_wingman_responses").insert({query_id:e,wingman_index:t.wingmanIndex,wingman_key_index:t.keyIndex+1,subtask:t.subtask,response:t.response,response_ms:t.durationMs,tokens_in:t.tokensIn,tokens_out:t.tokensOut,status:t.status,error_message:t.errorMessage||null,dispatched_at:new Date(Date.now()-t.durationMs).toISOString(),completed_at:new Date().toISOString()});s&&console.error(`DORYLUS TRACKER: Failed to log wingman ${t.wingmanIndex}:`,s)}async function O(e,t,s,n){let o=t.tokensIn+s.reduce((e,t)=>e+t.tokensIn,0),a=t.tokensOut+s.reduce((e,t)=>e+t.tokensOut,0),{error:r}=await R.from("dorylus_queries").update({alpha_fusion_input:s.map(e=>({wingman:e.wingmanIndex,response:e.response,status:e.status})),alpha_final_response:t.finalResponse,alpha_fusion_ms:t.durationMs,alpha_fusion_tokens_in:t.tokensIn,alpha_fusion_tokens_out:t.tokensOut,total_cycle_ms:n,total_tokens_in:o,total_tokens_out:a,total_tokens:o+a,status:"complete",all_wingmen_completed_at:new Date().toISOString(),fusion_completed_at:new Date().toISOString(),completed_at:new Date().toISOString()}).eq("id",e);r&&console.error("DORYLUS TRACKER: Failed to update fusion:",r),await I(o+a,n,s)}async function b(e,t,s,n,o,a){let{error:r}=await R.from("dorylus_errors").insert({query_id:e,bot_name:t,stage:s,error_type:n,error_message:o,error_stack:a?.stack||null,wingman_index:a?.wingmanIndex||null,cerebras_key_index:a?.keyIndex!=null?a.keyIndex+1:null,request_payload:a?.requestPayload||null,response_payload:a?.responsePayload||null,http_status:a?.httpStatus||null});r&&console.error("DORYLUS TRACKER: Failed to log error:",r),e&&await R.from("dorylus_queries").update({status:"error",error_message:o}).eq("id",e)}async function I(e,t,s){let n=new Date().toISOString().split("T")[0],{data:o}=await R.from("dorylus_daily_stats").select("*").eq("stat_date",n).single();if(o){let s=o.total_queries+1,{error:a}=await R.from("dorylus_daily_stats").update({total_queries:s,successful_queries:o.successful_queries+1,total_tokens_consumed:o.total_tokens_consumed+e,avg_cycle_ms:Math.round(((o.avg_cycle_ms||0)*o.total_queries+t)/s),min_cycle_ms:Math.min(o.min_cycle_ms||1/0,t),max_cycle_ms:Math.max(o.max_cycle_ms||0,t),updated_at:new Date().toISOString()}).eq("stat_date",n);a&&console.error("DORYLUS TRACKER: Failed to update daily stats:",a)}else{let{error:s}=await R.from("dorylus_daily_stats").insert({stat_date:n,total_queries:1,successful_queries:1,total_tokens_consumed:e,avg_cycle_ms:t,min_cycle_ms:t,max_cycle_ms:t});s&&console.error("DORYLUS TRACKER: Failed to insert daily stats:",s)}}async function A(e){let t=Date.now(),s="";try{s=await _(e.userId,e.botName,e.botSpace,e.originalQuery,e.botSystemPrompt),console.log(`[DORYLUS] Query ${s} started for bot ${e.botName}`),console.log("[DORYLUS] ALPHA decomposing query...");let n=await g(e.originalQuery,e.botSystemPrompt,e.temperature||h.temperature);await k(s,n),console.log(`[DORYLUS] Decomposed into ${n.subtasks.length} subtasks in ${n.durationMs}ms`),console.log(`[DORYLUS] Dispatching ${h.wingmanCount} wingmen...`);let o=n.subtasks.map((t,s)=>S(s+1,t,e.botSystemPrompt,e.temperature||h.temperature)),a=await Promise.all(o);for(let e of a)await E(s,e),console.log(`[DORYLUS] Wingman ${e.wingmanIndex}: ${e.status} in ${e.durationMs}ms (${e.tokensIn+e.tokensOut} tokens)`);let r=a.filter(e=>"complete"===e.status);if(console.log(`[DORYLUS] ${r.length}/${h.wingmanCount} wingmen completed successfully`),0===r.length){let o="All 5 wingmen failed — nothing to fuse";return await b(s,e.botName,"wingman_dispatch","all_failed",o),{queryId:s,botName:e.botName,originalQuery:e.originalQuery,finalResponse:"I apologize, but I was unable to process your request at this time. Please try again.",decomposition:n,wingmanResults:a,fusion:{finalResponse:"",durationMs:0,tokensIn:0,tokensOut:0,rawResponse:""},totalCycleMs:Date.now()-t,totalTokensIn:n.tokensIn,totalTokensOut:n.tokensOut,totalTokens:n.tokensIn+n.tokensOut,status:"error",errorMessage:o}}console.log(`[DORYLUS] ALPHA fusing ${r.length} wingman results...`);let i=await f(e.originalQuery,e.botSystemPrompt,a,e.temperature||h.temperature),u=Date.now()-t;await O(s,i,a,u);let l=n.tokensIn,c=n.tokensOut,p=a.reduce((e,t)=>e+t.tokensIn,0),m=a.reduce((e,t)=>e+t.tokensOut,0),d=i.tokensIn,y=i.tokensOut,w=l+p+d,R=c+m+y;return console.log(`[DORYLUS] ✅ COMPLETE in ${u}ms | ${w+R} total tokens`),{queryId:s,botName:e.botName,originalQuery:e.originalQuery,finalResponse:i.finalResponse,decomposition:n,wingmanResults:a,fusion:i,totalCycleMs:u,totalTokensIn:w,totalTokensOut:R,totalTokens:w+R,status:"complete"}}catch(o){let n=Date.now()-t;return await b(s||null,e.botName,"orchestrator","unknown",o.message||"Unknown orchestrator error",{stack:o.stack}),console.error(`[DORYLUS] ❌ FAILED after ${n}ms:`,o.message),{queryId:s||"unknown",botName:e.botName,originalQuery:e.originalQuery,finalResponse:"I apologize, but I encountered an error processing your request. Please try again.",decomposition:{subtasks:[],durationMs:0,tokensIn:0,tokensOut:0,rawResponse:""},wingmanResults:[],fusion:{finalResponse:"",durationMs:0,tokensIn:0,tokensOut:0,rawResponse:""},totalCycleMs:n,totalTokensIn:0,totalTokensOut:0,totalTokens:0,status:"error",errorMessage:o.message}}}var N=s(61238);let T="force-dynamic",L=new Map;async function x(e){try{let t,s;let n=await (0,u.u)(e);if(!n)return(0,u.C)();if("clerk"===n.type)t=n.userId;else{let e=n.agent;t=`bot:${e?.botName||e?.id||"unknown"}`}if(!function(e){let t=Date.now(),s=L.get(e);return!s||t>s.resetAt?(L.set(e,{count:1,resetAt:t+6e4}),!0):!(s.count>=10)&&(s.count++,!0)}(t))return i.NextResponse.json({success:!1,error:"Rate limited. Please wait a moment before sending another message."},{status:429});try{s=await e.json()}catch{return i.NextResponse.json({success:!1,error:"Invalid JSON body"},{status:400})}let{botName:o,message:a}=s;if(!o||"string"!=typeof o)return i.NextResponse.json({success:!1,error:"Missing botName"},{status:400});if(!a||"string"!=typeof a)return i.NextResponse.json({success:!1,error:"Missing message"},{status:400});let r=a.slice(0,2e3),l=await d(o);if(!l)return i.NextResponse.json({success:!1,error:"Bot not found or inactive"},{status:404});let c=await A({userId:t,botName:o,botSpace:l.config.space,originalQuery:r,botSystemPrompt:l.systemPrompt,temperature:l.config.temperature});if("error"===c.status)return i.NextResponse.json({success:!1,response:(0,N.L)(c.finalResponse),error:c.errorMessage||"DORYLUS cycle encountered an error",botName:c.botName,queryId:c.queryId,metrics:{totalCycleMs:c.totalCycleMs,totalTokens:c.totalTokens,wingmenCompleted:c.wingmanResults.filter(e=>"complete"===e.status).length}});return i.NextResponse.json({success:!0,response:(0,N.L)(c.finalResponse),botName:c.botName,queryId:c.queryId,metrics:{totalCycleMs:c.totalCycleMs,totalTokens:c.totalTokens,wingmenCompleted:c.wingmanResults.filter(e=>"complete"===e.status).length}})}catch(e){return console.error("[DORYLUS CHAT API] Unexpected error:",e),i.NextResponse.json({success:!1,error:"An unexpected error occurred. Please try again."},{status:500})}}let v=new o.AppRouteRouteModule({definition:{kind:a.x.APP_ROUTE,page:"/api/chat/route",pathname:"/api/chat",filename:"route",bundlePath:"app/api/chat/route"},resolvedPagePath:"/var/www/spacebot/src/app/api/chat/route.ts",nextConfigOutput:"",userland:n}),{requestAsyncStorage:Y,staticGenerationAsyncStorage:D,serverHooks:U}=v,M="/api/chat/route";function C(){return(0,r.patchFetch)({serverHooks:U,staticGenerationAsyncStorage:D})}},61238:(e,t,s)=>{s.d(t,{L:()=>n});function n(e){let t=e;return(t=(t=(t=(t=(t=(t=t.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,"")).replace(/\*\*(.+?)\*\*/g,"$1")).replace(/\*(.+?)\*/g,"$1")).replace(/^[\-\*]\s+/gm,"")).replace(/^#{1,6}\s+/gm,"")).trim()).length>800&&(t=t.substring(0,800)+"..."),t}},95456:(e,t,s)=>{s.d(t,{Py:()=>l,Xj:()=>d,YW:()=>m,Ym:()=>i,aX:()=>p,ks:()=>c,m:()=>u});var n=s(87070),o=s(90469),a=s(57745),r=s(23549);async function i(e){let t=e.headers.get("Authorization"),s=(0,r.r$)(t);if(!s){let t=e.headers.get("X-API-Key");t&&(0,r.aQ)(t)&&(s=t)}if(!s)return null;try{let e=await o.db.query.agents.findFirst({where:(0,a.eq)(o.DQ.apiKey,s)});if(!e||!await (0,r.V8)(s,e.apiKeyHash))return null;return await o.db.update(o.DQ).set({lastActive:new Date}).where((0,a.eq)(o.DQ.id,e.id)),e}catch(e){return console.error("Authentication error:",e),null}}function u(e="Unauthorized"){return n.NextResponse.json({success:!1,error:e,hint:"Include your API key in the Authorization header: Bearer botspace_xxxxx"},{status:401})}function l(e="Forbidden"){return n.NextResponse.json({success:!1,error:e},{status:403})}function c(e,t){return n.NextResponse.json({success:!1,error:e,details:t},{status:400})}function p(e="Not found"){return n.NextResponse.json({success:!1,error:e},{status:404})}function m(e="Internal server error"){return n.NextResponse.json({success:!1,error:e},{status:500})}function d(e,t=200){return n.NextResponse.json({success:!0,...e},{status:t})}},23549:(e,t,s)=>{s.d(t,{V8:()=>l,Vp:()=>m,_4:()=>u,aQ:()=>c,r$:()=>p});var n=s(42023),o=s.n(n),a=s(84770),r=s.n(a);let i="botspace_";async function u(){let e=r().randomBytes(24).toString("base64url"),t=`${i}${e}`,s=await o().hash(t,12);return{key:t,hash:s}}async function l(e,t){return!!c(e)&&o().compare(e,t)}function c(e){return!!(e&&e.startsWith(i))&&e.length===i.length+32}function p(e){if(!e)return null;let t=e.replace(/^Bearer\s+/i,"").trim();return c(t)?t:null}function m(){let e="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",t="";for(let s=0;s<8;s++)4===s&&(t+="-"),t+=e.charAt(Math.floor(Math.random()*e.length));return t}},83698:(e,t,s)=>{s.d(t,{C:()=>i,u:()=>r});var n=s(24910),o=s(87070),a=s(95456);async function r(e){let t=await (0,n.I)();if(t?.userId)return{type:"clerk",userId:t.userId};let s=await (0,a.Ym)(e);return s?{type:"bot",agent:s}:(console.log(`[AUTH FAIL] Clerk: no session | Bot: no API key | Route: ${e.url}`),null)}function i(){return o.NextResponse.json({success:!1,error:"Authentication required. Please sign in."},{status:401})}},1926:(e,t,s)=>{s.d(t,{p:()=>a});var n=s(37857);let o=process.env.SUPABASE_SERVICE_ROLE_KEY,a=(0,n.eI)("https://hpkkcbjiwmdwhmmzvwyx.supabase.co",o)}};var t=require("../../../webpack-runtime.js");t.C(e);var s=e=>t(t.s=e),n=t.X(0,[8948,7070,3170,4910,9463,7857,469],()=>s(74319));module.exports=n})();