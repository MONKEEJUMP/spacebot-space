"use strict";exports.id=810,exports.ids=[810],exports.modules={40810:(t,a,e)=>{e.d(a,{Z:()=>i});var r=e(10326),s=e(17577),n=e(61366);e(92430),e(20378);e(64282),e(5388),e(37978),e(5710);let o=`
@keyframes avatar-drift {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-3px); }
}
@keyframes avatar-jolt {
  0%, 90%, 100% { transform: translate(0, 0) rotate(0deg); }
  92% { transform: translate(2px, -1px) rotate(1.5deg); }
  94% { transform: translate(-1px, 1px) rotate(-1deg); }
  96% { transform: translate(1px, 0px) rotate(0.5deg); }
  98% { transform: translate(0, 0) rotate(0deg); }
}
@keyframes avatar-glitch {
  0%, 85%, 100% { transform: translate(0, 0); opacity: 1; }
  86% { transform: translate(3px, 0); opacity: 0.8; }
  87% { transform: translate(-2px, 0); opacity: 0.9; }
  88% { transform: translate(1px, 0); opacity: 0.7; }
  89% { transform: translate(0, 0); opacity: 1; }
}
@keyframes avatar-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}
@keyframes avatar-bounce {
  0%, 100% { transform: translateY(0); }
  15% { transform: translateY(-4px); }
  30% { transform: translateY(0); }
  40% { transform: translateY(-2px); }
  50% { transform: translateY(0); }
}
@keyframes avatar-scan {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  25% { transform: translateX(2px) rotate(0.5deg); }
  75% { transform: translateX(-2px) rotate(-0.5deg); }
}
`;function i({seed:t,size:a=120,faction:e,isBot:i=!1,animated:l=!0,customConfig:p,accentColor:c}){(0,s.useMemo)(()=>{if(!p||!("schematicId"in p))return;let t=p.schematicId;return"string"==typeof t?t:void 0},[p]);let f=(0,s.useRef)(null),m=(0,s.useRef)(null),y=(0,s.useMemo)(()=>{if(p)return{config:{bodyType:p.bodyType,eyeType:p.eyeType,mouthType:p.mouthType,accessories:["antenna","beacon_light"],surfaceFinish:"clean",animationType:p.animationType,headTilt:2,eyeTilt:1,panelLineCount:3,rivetCount:4,boltCount:2,serialSuffix:"CUST",humanAccessories:i?[]:p.accessories,botAccessories:i?p.accessories:[]},colors:{primary:p.colorPrimary,dark:p.colorDark,light:p.colorLight},showOverlay:!1!==p.showOverlay};let a=(0,n.F9)(t),r=(0,n.zg)(a,e,i),s=(0,n.F9)(t+":color"),o=(0,n.EC)(e,i,s);if(c){let t=c.replace("#",""),a=parseInt(t.substring(0,2),16),e=parseInt(t.substring(2,4),16),r=parseInt(t.substring(4,6),16);o={primary:c,dark:"#"+[a,e,r].map(t=>Math.round(.4*t).toString(16).padStart(2,"0")).join(""),light:"#"+[a,e,r].map(t=>Math.min(255,Math.round(1.4*t+40)).toString(16).padStart(2,"0")).join("")}}return{config:r,colors:o,showOverlay:!0}},[t,e,i,p,c]).config.animationType,d=l?`avatar-${y} ${({drift:4,jolt:6,glitch:5,breathe:5,bounce:3,scan:7})[y]??4}s ${({drift:"ease-in-out",jolt:"linear",glitch:"linear",breathe:"ease-in-out",bounce:"ease-in-out",scan:"ease-in-out"})[y]??"ease-in-out"} infinite`:"none";return(0,r.jsxs)("div",{style:{width:a,height:a,position:"relative"},children:[r.jsx("style",{children:o}),(0,r.jsxs)("div",{style:{animation:d,position:"relative",width:a,height:a},children:[r.jsx("canvas",{ref:f,style:{width:a,height:a,display:"block"}}),r.jsx("canvas",{ref:m,style:{width:a,height:a,display:"block",position:"absolute",top:0,left:0,pointerEvents:"none"}})]})]})}},37978:(t,a,e)=>{e(61366),e(20378)}};