(function(){
  function pickTextBlock(){
    const candidates = [
      '#content','.content','main article','article','.article','main','.text','.text-box','.page-content','.container','.wrapper'
    ];
    for(const sel of candidates){
      const el = document.querySelector(sel);
      if(el) return el;
    }
    return document.body;
  }
  function getOverflowY(el){
    const cs = getComputedStyle(el);
    return cs.overflowY || cs.overflow || 'visible';
  }
  function findScrollContainer(start){
    let el = start;
    while (el && el !== document.documentElement && el !== document.body){
      const oy = getOverflowY(el);
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  // Ensure root exists / or create
  let root = document.getElementById('pw-root');
  if (!root){
    root = document.createElement('aside');
    root.id = 'pw-root';
    root.setAttribute('role','button'); root.setAttribute('tabindex','0'); root.setAttribute('aria-disabled','true');
    root.setAttribute('aria-label','Прогресс чтения: 0%');
    document.body.appendChild(root);
  }
  root.innerHTML = '<div class="pw-visual">'+
                     '<div class="pw-dot"></div>'+
                     '<div class="pw-pill"></div>'+
                     '<div class="pw-pct"><span id="pwPct">0%</span></div>'+
                     '<div class="pw-next">Далее</div>'+
                   '</div>';

  const visual = root.querySelector('.pw-visual');
  const dot  = root.querySelector('.pw-dot');
  const pill = root.querySelector('.pw-pill');
  const pct  = root.querySelector('.pw-pct');
  const next = root.querySelector('.pw-next');
  const pctSpan = root.querySelector('#pwPct');

  const styles = getComputedStyle(document.documentElement);
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const textBlock = pickTextBlock();
  const scroller  = findScrollContainer(textBlock);

  function updateHorizontal(){
    const r = textBlock.getBoundingClientRect();
    const center = r.left + r.width/2;
    root.style.left = center.toFixed(2) + 'px';
    root.style.transform = 'translateX(-50%)';
  }

  function clamp01(x){ return x<0?0:x>1?1:x; }
  function measureProgress(){
    if (scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body){
      const r = textBlock.getBoundingClientRect();
      const viewport = window.innerHeight;
      const total = Math.max(textBlock.scrollHeight, r.height) - viewport;
      if (total <= 0) return 1;
      const read = Math.min(Math.max(-r.top, 0), total);
      return clamp01(read / total);
    }else{
      const total = Math.max(scroller.scrollHeight, textBlock.scrollHeight) - scroller.clientHeight;
      if (total <= 0) return 1;
      const read = scroller.scrollTop;
      return clamp01(read / total);
    }
  }

  // "Next" URL detection
  function detectNextUrl(){
    // explicit data-next-url attribute
    const explicit = root.getAttribute('data-next-url');
    if (explicit && explicit !== '#') return explicit;

    // <link rel="next">
    const linkNext = document.querySelector('link[rel=next][href]');
    if (linkNext) return linkNext.getAttribute('href');

    // <a rel="next"> or common classes
    const anchorRel = document.querySelector('a[rel=next][href], a.next[href], nav .next a[href]');
    if (anchorRel) return anchorRel.getAttribute('href');

    // text-based search (ru/en)
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const key = ['далее','следующая','следующий','next','more'];
    for (const a of anchors){
      const t = (a.textContent || '').trim().toLowerCase();
      if (t && key.some(k => t.includes(k))) return a.getAttribute('href');
    }
    return '#';
  }

  const NEXT_URL = detectNextUrl();

  // Animations: crossfade between two layers (dot→pill) from center
  let aDot = null, aPill = null, aPct = null, aNext = null;
  let doneState = false, ticking = false;

  function killAnims(){ for (const a of [aDot,aPill,aPct,aNext]){ try{ a && a.cancel(); }catch(e){} } aDot=aPill=aPct=aNext=null; }

  function playForward(){
    if (prefersReduced){
      dot.style.opacity = '0';
      pill.style.opacity = '1'; pill.style.transform = 'translate(-50%,-50%) scaleX(1)';
      pct.style.opacity = '0'; next.style.opacity = '1'; return;
    }
    killAnims();
    aDot = dot.animate(
      [
        { transform:'translate(-50%,-50%) scale(1)', opacity:1 },
        { transform:'translate(-50%,-50%) scale(1.06)', opacity:0.6, offset:0.35 },
        { transform:'translate(-50%,-50%) scale(0.94)', opacity:0 }
      ],
      { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)', fill:'forwards' }
    );
    aPill = pill.animate(
      [
        { transform:'translate(-50%,-50%) scaleX(0.001)', opacity:0 },
        { transform:'translate(-50%,-50%) scaleX(1.06)',  opacity:1, offset:0.7 },
        { transform:'translate(-50%,-50%) scaleX(1)',     opacity:1 }
      ],
      { duration: 900, easing: 'cubic-bezier(.2,.8,.2,1)', fill:'forwards' }
    );
    aPct  = pct.animate([{opacity:1},{opacity:0}], { duration:320, easing:'ease', fill:'forwards', delay:150 });
    aNext = next.animate([{opacity:0},{opacity:1}], { duration:420, easing:'ease', fill:'forwards', delay:360 });
  }

  function playReverse(){
    if (prefersReduced){
      dot.style.opacity = '1'; dot.style.transform = 'translate(-50%,-50%) scale(1)';
      pill.style.opacity = '0'; pill.style.transform = 'translate(-50%,-50%) scaleX(0.001)';
      pct.style.opacity = '1'; next.style.opacity = '0'; return;
    }
    killAnims();
    aDot = dot.animate(
      [
        { transform:'translate(-50%,-50%) scale(0.94)', opacity:0 },
        { transform:'translate(-50%,-50%) scale(1.06)', opacity:0.6, offset:0.65 },
        { transform:'translate(-50%,-50%) scale(1)',    opacity:1 }
      ],
      { duration: 650, easing:'cubic-bezier(.2,.8,.2,1)', fill:'forwards' }
    );
    aPill = pill.animate(
      [
        { transform:'translate(-50%,-50%) scaleX(1)', opacity:1 },
        { transform:'translate(-50%,-50%) scaleX(0.001)', opacity:0 }
      ],
      { duration: 700, easing:'cubic-bezier(.2,.8,.2,1)', fill:'forwards' }
    );
    aPct  = pct.animate([{opacity:0},{opacity:1}], { duration:360, easing:'ease', fill:'forwards', delay:360 });
    aNext = next.animate([{opacity:1},{opacity:0}], { duration:320, easing:'ease', fill:'forwards', delay:120 });
  }

  function onScroll(){ if (ticking) return; ticking = true; requestAnimationFrame(update); }
  function update(){
    ticking = false;
    const p = measureProgress();
    const perc = Math.round(p*100);
    pctSpan.textContent = perc + '%';
    root.setAttribute('aria-label','Прогресс чтения: ' + perc + '%');
    const shouldBeDone = perc >= 100;
    // toggle button state (visual + a11y)
    if (shouldBeDone && !doneState){
      doneState = true;
      root.classList.add('is-done');
      root.setAttribute('aria-disabled','false');
      root.setAttribute('aria-label','Кнопка: Далее');
      playForward();
    } else if (!shouldBeDone && doneState){
      doneState = false;
      root.classList.remove('is-done');
      root.setAttribute('aria-disabled','true');
      root.setAttribute('aria-label','Прогресс чтения: ' + perc + '%');
      playReverse();
    } else {
      // update live label while reading
      if (!shouldBeDone) root.setAttribute('aria-label','Прогресс чтения: ' + perc + '%');
    }
  }

  // Click action
  root.addEventListener('click', ()=>{
    if (doneState){
      if (NEXT_URL && NEXT_URL !== '#'){
        window.location.href = NEXT_URL;
      }else{
        // fallback: scroll to top (as "next step") if no next link
        window.scrollTo({top:0, behavior:'smooth'});
      }
    }else{
      // not done -> scroll smoothly to the end of the text block
      const endY = (scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body)
        ? (window.scrollY + (textBlock.getBoundingClientRect().bottom - window.innerHeight + 1))
        : scroller.scrollHeight - scroller.clientHeight;
      if (scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body){
        window.scrollTo({ top: endY, behavior:'smooth' });
      }else{
        scroller.scrollTo({ top: endY, behavior:'smooth' });
      }
    }
  }, {passive:true});

  // listeners
  window.addEventListener('scroll', onScroll, {passive:true});
  if (scroller !== document.scrollingElement && scroller !== document.documentElement && scroller !== document.body){
    scroller.addEventListener('scroll', onScroll, {passive:true});
  }
  window.addEventListener('resize', ()=>{ updateHorizontal(); onScroll(); });

  // init
  updateHorizontal();
  // initial visible states
  dot.style.opacity = '1';
  pill.style.opacity = '0';
  pill.style.transform = 'translate(-50%,-50%) scaleX(0.001)';
  pct.style.opacity = '1'; next.style.opacity = '0';
  update();
})();
// Keyboard activation for accessibility
root.addEventListener('keydown', (e)=>{
  if (e.key === 'Enter' || e.key === ' '){
    e.preventDefault();
    root.click();
  }
});
