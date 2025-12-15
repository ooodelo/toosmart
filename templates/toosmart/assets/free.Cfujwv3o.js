const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["script.Dcl11Uvt.js","legal-modals.B2Gw208J.js"])))=>i.map(i=>d[i]);
import{_ as I,i as L,a as O,b as M}from"./legal-modals.B2Gw208J.js";const R=15,A=8,z=`
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`,N=`
  precision mediump float;
  uniform float u_time;
  uniform vec2 u_resolution;

  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  vec2 hash2(vec2 p) {
      p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
      return fract(sin(p)*43758.5453123);
  }

  void main() {
      vec2 screenPos = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
      vec2 uv = screenPos / 360.0;
      
      float t = u_time * 0.35;
      
      vec2 pWarp = uv;
      float n = snoise(pWarp * 1.5 + t * 0.3);
      pWarp.x += n * 0.2;
      pWarp.y += snoise(pWarp * 1.2 - t * 0.35) * 0.2;

      vec2 gridId = floor(pWarp);
      vec2 gridUv = fract(pWarp) - 0.5;
      
      float v = 0.0;
      
      for(float y = -1.0; y <= 1.0; y++) {
          for(float x = -1.0; x <= 1.0; x++) {
              vec2 neighbor = vec2(x, y);
              vec2 cellId = gridId + neighbor;
              
              vec2 r = hash2(cellId);
              
              vec2 centerAnim = vec2(
                  sin(t * 0.7 + r.x * 6.28) * 0.6,
                  cos(t * 0.6 + r.y * 6.28) * 0.6
              );
              vec2 center = neighbor + centerAnim; 
              
              for(int i = 0; i < 4; i++) {
                  float fi = float(i);
                  
                  float angle = t * (0.5 + r.x * 0.5) + fi * 2.5;
                  float radius = 0.15 + 0.1 * sin(t + fi * 10.0 + r.y * 5.0);
                  
                  vec2 blobOffset = vec2(cos(angle), sin(angle)) * radius;
                  
                  float d = length(gridUv - (center + blobOffset));
                  float blobSize = 0.5 + 0.2 * sin(fi * 4.0 + t * 2.0 + r.x * 10.0);
                  
                  v += blobSize / (d * d * 16.0 + 0.5);
              }
          }
      }
      
      v *= 1.1;
      
      float edgeNoise = snoise(uv * 3.0 - t * 1.0);
      
      float alpha = smoothstep(0.8 + 0.1 * edgeNoise, 2.2, v);
      float splash = smoothstep(0.2, 1.0, v) * 0.5;
      float finalAlpha = alpha + splash * (1.0 - alpha);
      float glow = smoothstep(0.05, 0.5, v) * 0.1;
      finalAlpha += glow * (1.0 - finalAlpha);
      finalAlpha = clamp(finalAlpha, 0.0, 1.0);
      
      vec3 color = vec3(0.9607, 0.9607, 0.9607);
      gl_FragColor = vec4(color * finalAlpha, finalAlpha);
  }
`;function D(n){const o=360/A,e=3,l=[];for(let t=0;t<A;t++){const s=t*o,a=s+o-e,v=t<n?"rgba(0,0,0,0.9)":"rgba(0,0,0,0)";l.push(`${v} ${s}deg ${a}deg`),l.push(`rgba(0,0,0,0) ${a}deg ${(t+1)*o}deg`)}return`conic-gradient(${l.join(",")})`}function B(n,o){const e=Math.max(0,Math.min(A,Math.ceil(o/R*A))),l=e>0?D(e):"";n.forEach(t=>{e===0?(t.setAttribute("hidden",""),t.style.backgroundImage="none"):(t.removeAttribute("hidden"),t.style.backgroundImage=l)})}function q(n){if(!n)return()=>{};const o=document.createElement("canvas");o.className="paywall-fluid__canvas",n.appendChild(o);const e=o.getContext("webgl",{alpha:!0,premultipliedAlpha:!0});if(!e)return o.remove(),()=>{};const l=(u,x)=>{const i=e.createShader(u);return i?(e.shaderSource(i,x),e.compileShader(i),e.getShaderParameter(i,e.COMPILE_STATUS)?i:(console.error("[Paywall] Shader compile error:",e.getShaderInfoLog(i)),e.deleteShader(i),null)):null},t=l(e.VERTEX_SHADER,z),s=l(e.FRAGMENT_SHADER,N);if(!t||!s)return()=>{};const a=e.createProgram();if(!a)return()=>{};if(e.attachShader(a,t),e.attachShader(a,s),e.linkProgram(a),!e.getProgramParameter(a,e.LINK_STATUS))return console.error("[Paywall] Program link error:",e.getProgramInfoLog(a)),()=>{};const v=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,v),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),e.STATIC_DRAW);const S=e.getAttribLocation(a,"position");e.enableVertexAttribArray(S),e.vertexAttribPointer(S,2,e.FLOAT,!1,0,0);const b=e.getUniformLocation(a,"u_time"),d=e.getUniformLocation(a,"u_resolution");let h=null,p=performance.now();const f=()=>{const u=n.getBoundingClientRect(),x=1,i=Math.max(1,Math.floor(u.width*x)),y=Math.max(1,Math.floor(u.height*x));o.width=i,o.height=y,o.style.width=`${u.width}px`,o.style.height=`${u.height}px`,e.viewport(0,0,i,y)};if(typeof ResizeObserver>"u")return()=>{o.remove()};const g=new ResizeObserver(f);g.observe(n),f();const m=()=>{const u=(performance.now()-p)/1e3;e.useProgram(a),e.uniform1f(b,u),e.uniform2f(d,o.width,o.height),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.drawArrays(e.TRIANGLES,0,6),h=requestAnimationFrame(m)};return m(),()=>{h&&cancelAnimationFrame(h),g.disconnect(),e.deleteBuffer(v),e.deleteProgram(a),e.deleteShader(t),e.deleteShader(s)}}function U(n){const o=n.dataset.lockedSrc||"",e=n.querySelector("[data-locked-body]"),l=document.querySelector("[data-paywall-fab]"),t=l==null?void 0:l.querySelector("[data-paywall-add]"),s=t==null?void 0:t.querySelector("[data-paywall-add-label]"),a=l==null?void 0:l.querySelector("[data-paywall-timer]"),v=a?[a]:[],S=n.querySelector("[data-fluid-overlay]"),b=q(S);let d=[],h=0,p=!1,f=0,g=null,m=null,u=!1;const x=(e==null?void 0:e.querySelector(".paywall-text__hint"))||null,i=()=>{g&&(clearInterval(g),g=null)},y=()=>{const r=v.length>0,c=r&&f>0;t&&(t.hidden=c,t.disabled=c&&r||p),B(v,f)},P=()=>{f=R,y(),i(),g=window.setInterval(()=>{f=Math.max(0,f-1),y(),f===0&&i(),w()},1e3)},E=r=>{if(!e)return;const c=e.querySelector(".paywall-text__error");if(c){c.textContent=r;return}const _=document.createElement("p");_.className="paywall-text__error",_.textContent=r,e.appendChild(_)},C=()=>{!e||m||(m=document.createElement("p"),m.className="paywall-text__end",m.textContent="Достигнут конец статьи",e.appendChild(m))},k=r=>{if(!e)return;const c=document.createElement("p");c.innerHTML=r,e.appendChild(c),x&&x.remove()},w=()=>{if(!t)return;const r=!o&&d.length===0,c=d.length>0&&h>=d.length||u&&d.length===0,_=p||c||r||f>0;t.disabled=_,s&&(r?s.textContent="Источник не задан":p?s.textContent="Загрузка...":c?s.textContent="Текст закончился":s.textContent="Добавить абзац")},F=async()=>{if(d.length||p||!o)return d;p=!0,u=!0,w();try{const r=await fetch(o,{credentials:"same-origin"});if(!r.ok)throw new Error("bad response");const c=await r.json();return d=Array.isArray(c.blocks)?c.blocks:[],d.length||E("Полный текст недоступен"),d}catch(r){return console.error("[Paywall] Failed to load locked content",r),E("Не удалось загрузить полный текст"),[]}finally{p=!1,w()}},T=async()=>{if(f>0||p)return;const r=await F();if(r.length){if(h>=r.length){C(),w();return}k(r[h]),h+=1,w(),h>=r.length&&C(),P()}};return y(),w(),t==null||t.addEventListener("click",T),()=>{i(),t==null||t.removeEventListener("click",T),b()}}function W(){const n=document.querySelectorAll("[data-paywall-root]");n.length&&U(n[0])}I(()=>import("./script.Dcl11Uvt.js"),__vite__mapDeps([0,1])).catch(n=>{console.error("[App] Base script failed to load",n)});window.__DEV_LOGIN_BYPASS__=!1;window.__APP_VERSION__="free";L();O();M();W();console.log("[App] Free version initialized");
