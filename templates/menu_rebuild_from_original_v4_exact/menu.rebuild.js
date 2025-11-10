
(function(){
  'use strict';
  const q = s=>document.querySelector(s);
  const rail = q('.dot-status');
  const flyout = q('.dot-flyout');
  const backdrop = q('.flyout-backdrop');
  const textBox = q('.text-box');
  let chapters = Array.from(document.querySelectorAll('.test-text .chapter'));
  if(!rail || !flyout || !backdrop || !textBox){
    console.warn('[menu-rebuild v4] required nodes missing'); return;
  }
  if(chapters.length===0){
    const host = q('.test-text'); chapters = [];
    for(let i=1;i<=5;i++){
      const sec = document.createElement('section'); sec.className='chapter'; sec.id='ch-'+i;
      sec.innerHTML = `<h2 class="chapter__title">Раздел ${i}</h2>
      <p>Демо-текст для проверки точек и флайаута.</p>
      <p>Индикатор абзацев на активной точке (внешнее кольцо 1/2/3px).</p>
      <p>Флайаут — «стекло»: blur & saturate, точные токены.</p>`;
      host && host.appendChild(sec); chapters.push(sec);
    }
  }

  // Build dots for each chapter
  rail.innerHTML = '';
  const dots = chapters.map((ch, idx)=>{
    const dot = document.createElement('button');
    dot.type = 'button'; dot.className = 'dot';
    dot.setAttribute('aria-label', (ch.querySelector('.chapter__title')?.textContent || ('Раздел ' + (idx+1))).trim());
    dot.addEventListener('click', ()=>{ setActive(idx); openFlyout(dot); });
    dot.addEventListener('keydown', (e)=>{
      if(e.key==='Enter' || e.key===' '){ e.preventDefault(); setActive(idx); openFlyout(dot); }
      if(e.key==='Escape'){ e.preventDefault(); closeFlyout(); }
      if(e.key==='ArrowUp'){ e.preventDefault(); focusDot(Math.max(0, idx-1)); }
      if(e.key==='ArrowDown'){ e.preventDefault(); focusDot(Math.min(chapters.length-1, idx+1)); }
    });
    rail.appendChild(dot);
    return dot;
  });

  function focusDot(i){ dots[i] && dots[i].focus(); }
  function setActive(i){
    dots.forEach((d,k)=>d.classList.toggle('is-active', k===i));
    updateParagraphRing(i);
  }

  // Position rail relative to text column
  function repositionRail(){
    const rr = textBox.getBoundingClientRect();
    const sx = window.scrollX || document.documentElement.scrollLeft || 0;
    const w = (dots[0]?.offsetWidth || 11);
    const gap = 10;
    rail.style.left = Math.max(0, rr.left + sx - w - gap) + 'px';
  }

  // Paragraph progress ring: thickness 0/1/2/3px without touching fill
  function updateParagraphRing(activeIndex){
    const ch = chapters[activeIndex];
    if(!ch) return;
    const paras = ch.querySelectorAll('p');
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const vh = window.innerHeight || 800;
    const anchor = y + vh*0.5;
    let pIndex = 0;
    paras.forEach((p,i)=>{
      const r = p.getBoundingClientRect();
      const top = r.top + y;
      if(top <= anchor) pIndex = i+1;
    });
    const ring = pIndex === 0 ? 0 : (pIndex===1 ? 1 : (pIndex===2 ? 2 : 3));
    const dot = dots[activeIndex];
    if(dot){
      dot.style.setProperty('--p-ring', ring + 'px');
    }
  }

  // Active chapter sync (by mid-viewport)
  function syncActiveByScroll(){
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const vh = window.innerHeight || 800;
    const anchor = y + vh*0.5;
    let active = 0;
    chapters.forEach((ch,i)=>{
      const r = ch.getBoundingClientRect();
      const top = r.top + y;
      if(top <= anchor) active = i;
    });
    setActive(active);
  }

  // Flyout list
  function buildFlyout(){
    flyout.innerHTML = '<ul class="flyout-list"></ul>';
    const ul = flyout.querySelector('.flyout-list');
    chapters.forEach((ch, idx)=>{
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type='button'; btn.className='flyout-item'; btn.dataset.index=String(idx);
      btn.textContent=(ch.querySelector('.chapter__title')?.textContent || ('Раздел '+(idx+1))).trim();
      btn.addEventListener('click', ()=>{
        ch.querySelector('.chapter__title')?.scrollIntoView({behavior:'smooth', block:'start'});
        setActive(idx); closeFlyout();
      });
      li.appendChild(btn); ul.appendChild(li);
    });
  }

  function positionFlyout(anchor){
    const ar = anchor.getBoundingClientRect();
    const sx = window.scrollX || document.documentElement.scrollLeft || 0;
    const sy = window.scrollY || document.documentElement.scrollTop || 0;
    // горизонтально — справа от точки; вертикально — центрируем по точке
    const left = ar.right + sx + 16;
    const topCenter = ar.top + sy + (ar.height/2);
    flyout.style.left = left + 'px';
    // центрирование по вертикали относительно середины точки, с ограничением от 20px
    const fh = Math.min(flyout.offsetHeight || 0, (window.innerHeight||800)*0.7);
    const top = Math.max(20, topCenter - fh/2);
    flyout.style.top = top  + 'px';
  }

  function openFlyout(from){
    buildFlyout();
    // показать сперва, чтобы измерить
    flyout.classList.add('is-open');
    positionFlyout(from);
    backdrop.classList.add('is-open');
  }
  function closeFlyout(){
    flyout.classList.remove('is-open');
    backdrop.classList.remove('is-open');
  }

  backdrop.addEventListener('click', closeFlyout);
  window.addEventListener('scroll', ()=>{
    syncActiveByScroll();
    if(flyout.classList.contains('is-open')){
      const a = rail.querySelector('.dot.is-active') || dots[0];
      a && positionFlyout(a);
    }
  }, {passive:true});
  window.addEventListener('resize', ()=>{
    repositionRail();
    if(flyout.classList.contains('is-open')){
      const a = rail.querySelector('.dot.is-active') || dots[0];
      a && positionFlyout(a);
    }
  }, {passive:true});
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeFlyout(); });

  // init
  setActive(0);
  repositionRail();
  syncActiveByScroll();
})();
