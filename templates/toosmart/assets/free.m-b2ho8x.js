const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["script.CYa9dGYY.js","legal-modals.B2Gw208J.js"])))=>i.map(i=>d[i]);
import{_ as I,i as L,a as O,b as M}from"./legal-modals.B2Gw208J.js";const P=15,b=8,z=`
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
      vec2 uv = screenPos / 180.0;
      
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
      
      v *= 1.65;
      
      float edgeNoise = snoise(uv * 3.0 - t * 1.0);
      
      float alpha = smoothstep(0.6 + 0.1 * edgeNoise, 2.5, v);
      float splash = smoothstep(0.2, 1.0, v) * 0.5;
      float finalAlpha = alpha + splash * (1.0 - alpha);
      float glow = smoothstep(0.05, 0.5, v) * 0.1;
      finalAlpha += glow * (1.0 - finalAlpha);
      finalAlpha = clamp(finalAlpha, 0.0, 1.0);
      
      vec3 color = vec3(0.9607, 0.9607, 0.9607);
      gl_FragColor = vec4(color * finalAlpha, finalAlpha);
  }
`;function D(a){const o=360/b,e=3,t=[];for(let r=0;r<b;r++){const s=r*o,l=s+o-e,x=r<a?"rgba(0,0,0,0.9)":"rgba(0,0,0,0)";t.push(`${x} ${s}deg ${l}deg`),t.push(`rgba(0,0,0,0) ${l}deg ${(r+1)*o}deg`)}return`conic-gradient(${t.join(",")})`}function E(a,o){const e=Math.max(0,Math.min(b,Math.ceil(o/P*b))),t=e>0?D(e):"";a.forEach(r=>{e===0?(r.setAttribute("hidden",""),r.style.backgroundImage="none"):(r.removeAttribute("hidden"),r.style.backgroundImage=t)})}function q(a){if(!a)return()=>{};const o=document.createElement("canvas");o.className="paywall-fluid__canvas",a.appendChild(o);const e=o.getContext("webgl",{alpha:!0,premultipliedAlpha:!1});if(!e)return o.remove(),()=>{};const t=(u,m)=>{const i=e.createShader(u);return i?(e.shaderSource(i,m),e.compileShader(i),e.getShaderParameter(i,e.COMPILE_STATUS)?i:(console.error("[Paywall] Shader compile error:",e.getShaderInfoLog(i)),e.deleteShader(i),null)):null},r=t(e.VERTEX_SHADER,z),s=t(e.FRAGMENT_SHADER,N);if(!r||!s)return()=>{};const l=e.createProgram();if(!l)return()=>{};if(e.attachShader(l,r),e.attachShader(l,s),e.linkProgram(l),!e.getProgramParameter(l,e.LINK_STATUS))return console.error("[Paywall] Program link error:",e.getProgramInfoLog(l)),()=>{};const x=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,x),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),e.STATIC_DRAW);const S=e.getAttribLocation(l,"position");e.enableVertexAttribArray(S),e.vertexAttribPointer(S,2,e.FLOAT,!1,0,0);const d=e.getUniformLocation(l,"u_time"),v=e.getUniformLocation(l,"u_resolution");let h=null,f=performance.now();const g=()=>{const u=a.getBoundingClientRect(),m=window.devicePixelRatio||1,i=Math.max(1,Math.floor(u.width*m)),A=Math.max(1,Math.floor(u.height*m));o.width=i,o.height=A,o.style.width=`${u.width}px`,o.style.height=`${u.height}px`,e.viewport(0,0,i,A)};if(typeof ResizeObserver>"u")return()=>{o.remove()};const p=new ResizeObserver(g);p.observe(a),g();const _=()=>{const u=(performance.now()-f)/1e3;e.useProgram(l),e.uniform1f(d,u),e.uniform2f(v,o.width,o.height),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.drawArrays(e.TRIANGLES,0,6),h=requestAnimationFrame(_)};return _(),()=>{h&&cancelAnimationFrame(h),p.disconnect(),e.deleteBuffer(x),e.deleteProgram(l),e.deleteShader(r),e.deleteShader(s)}}function B(a){var R;const o=a.dataset.lockedSrc||"",e=a.querySelector("[data-locked-body]"),t=((R=a.parentElement)==null?void 0:R.querySelector("[data-paywall-add]"))||document.querySelector("[data-paywall-add]"),r=t==null?void 0:t.querySelector("[data-paywall-add-label]"),s=Array.from(a.querySelectorAll("[data-paywall-timer]")),l=t?t.querySelectorAll("[data-paywall-timer]"):[];s.push(...l);const x=a.querySelector("[data-fluid-overlay]"),S=q(x);let d=[],v=0,h=!1,f=0,g=null,p=null,_=!1;const u=(e==null?void 0:e.querySelector(".paywall-locked__hint"))||null,m=()=>{g&&(clearInterval(g),g=null)},i=()=>{f=P,E(s,f),m(),g=window.setInterval(()=>{f=Math.max(0,f-1),E(s,f),f===0&&m(),y()},1e3)},A=n=>{if(!e)return;const c=e.querySelector(".paywall-locked__error");if(c){c.textContent=n;return}const w=document.createElement("p");w.className="paywall-locked__error",w.textContent=n,e.appendChild(w)},C=()=>{!e||p||(p=document.createElement("p"),p.className="paywall-locked__end",p.textContent="Достигнут конец статьи",e.appendChild(p))},T=n=>{if(!e)return;const c=document.createElement("div");c.className="paywall-locked__block",c.innerHTML=n,e.appendChild(c),u&&u.remove()},y=()=>{if(!t)return;const n=!o&&d.length===0,c=d.length>0&&v>=d.length||_&&d.length===0,w=h||f>0||c||n;t.disabled=w,r&&(n?r.textContent="Источник не задан":h?r.textContent="Загрузка...":c?r.textContent="Текст закончился":r.textContent="Добавить абзац")},F=async()=>{if(d.length||h||!o)return d;h=!0,_=!0,y();try{const n=await fetch(o,{credentials:"same-origin"});if(!n.ok)throw new Error("bad response");const c=await n.json();return d=Array.isArray(c.blocks)?c.blocks:[],d.length||A("Полный текст недоступен"),d}catch(n){return console.error("[Paywall] Failed to load locked content",n),A("Не удалось загрузить полный текст"),[]}finally{h=!1,y()}},k=async()=>{if(f>0||h)return;const n=await F();if(n.length){if(v>=n.length){C(),y();return}T(n[v]),v+=1,y(),v>=n.length&&C(),i()}};return E(s,f),y(),t==null||t.addEventListener("click",k),()=>{m(),t==null||t.removeEventListener("click",k),S()}}function U(){const a=document.querySelectorAll("[data-paywall-root]");a.length&&a.forEach(B)}I(()=>import("./script.CYa9dGYY.js"),__vite__mapDeps([0,1])).catch(a=>{console.error("[App] Base script failed to load",a)});window.__DEV_LOGIN_BYPASS__=!1;window.__APP_VERSION__="free";L();O();M();U();console.log("[App] Free version initialized");
