const COOLDOWN_SECONDS = 15;
const TIMER_SEGMENTS = 8;
const MAX_FPS = 16;
const FRAME_INTERVAL = 1000 / MAX_FPS;
const DEV_SAMPLE_PARAGRAPH = `Представьте себе мир, где мысли текут как жидкость, заполняя любые формы, предложенные обстоятельствами. В отличие от кристаллизованного знания, которое остается твердым и неизменным, подвижный интеллект — это река, прокладывающая новые русла через породу неизвестного. Это способность видеть взаимосвязи независимо от предыдущего опыта или инструкций. Недавние исследования нейропластичности подсказывают, что это когнитивное состояние — не просто метафора, а физиологическая реальность. Синаптические пути в мозге, когда они заняты решением новых задач, демонстрируют поведение, удивительно похожее на турбулентные потоки в природе.`;

const VERTEX_SHADER = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
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
      // Более частая сетка для плотного покрытия
      vec2 uv = screenPos / 300.0;
      
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
                  
                  float angle = t * (0.55 + r.x * 0.45) + fi * 2.3;
                  float radius = 0.18 + 0.1 * sin(t + fi * 7.0 + r.y * 5.0);
                  
                  vec2 blobOffset = vec2(cos(angle), sin(angle)) * radius;
                  
                  float d = length(gridUv - (center + blobOffset));
                  float blobSize = 0.55 + 0.25 * sin(fi * 4.0 + t * 2.0 + r.x * 10.0);
                  
                  v += blobSize / (d * d * 10.0 + 0.45);
              }
          }
      }
      
      // Базовая плотность, чтобы избежать провалов в полную прозрачность
      v = max(v, 0.06);
      v *= 1.0;
      
      float edgeNoise = snoise(uv * 3.0 - t * 1.0);
      
      // Порог под 30% видимой площади (≈70% скрыто)
      float alpha = smoothstep(1.0 + 0.1 * edgeNoise, 2.6, v);
      float splash = smoothstep(0.3, 1.2, v) * 0.45;
      float finalAlpha = alpha + splash * (1.0 - alpha);
      float glow = smoothstep(0.06, 0.55, v) * 0.1;
      finalAlpha += glow * (1.0 - finalAlpha);
      finalAlpha = clamp(finalAlpha, 0.0, 1.0);
      
      vec3 color = vec3(0.9607, 0.9607, 0.9607);
      gl_FragColor = vec4(color * finalAlpha, finalAlpha);
  }
`;

function buildTimerGradient(activeSegments) {
  const segmentAngle = 360 / TIMER_SEGMENTS;
  const gap = 3;
  const stops = [];

  for (let i = 0; i < TIMER_SEGMENTS; i++) {
    const start = i * segmentAngle;
    const end = start + segmentAngle - gap;
    const fill = i < activeSegments ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0)';
    stops.push(`${fill} ${start}deg ${end}deg`);
    stops.push(`rgba(0,0,0,0) ${end}deg ${(i + 1) * segmentAngle}deg`);
  }

  return `conic-gradient(${stops.join(',')})`;
}

function updateTimers(timers, remainingSeconds) {
  const activeSegments = Math.max(0, Math.min(TIMER_SEGMENTS, Math.ceil((remainingSeconds / COOLDOWN_SECONDS) * TIMER_SEGMENTS)));
  const gradient = activeSegments > 0 ? buildTimerGradient(activeSegments) : '';

  timers.forEach(timer => {
    if (activeSegments === 0) {
      timer.setAttribute('hidden', '');
      timer.style.backgroundImage = 'none';
    } else {
      timer.removeAttribute('hidden');
      timer.style.backgroundImage = gradient;
    }
  });
}

function initFluidOverlay(container) {
  if (!container) return () => { };

  const canvas = document.createElement('canvas');
  canvas.className = 'paywall-fluid__canvas';
  container.appendChild(canvas);

  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
  if (!gl) {
    canvas.remove();
    return () => { };
  }

  const createShader = (type, source) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[Paywall] Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertShader = createShader(gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragShader = createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertShader || !fragShader) return () => { };

  const program = gl.createProgram();
  if (!program) return () => { };
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('[Paywall] Program link error:', gl.getProgramInfoLog(program));
    return () => { };
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1.0, -1.0,
      1.0, -1.0,
      -1.0, 1.0,
      -1.0, 1.0,
      1.0, -1.0,
      1.0, 1.0,
    ]),
    gl.STATIC_DRAW
  );

  const positionLocation = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(program, 'u_time');
  const uResolution = gl.getUniformLocation(program, 'u_resolution');

  let rafId = null;
  let start = performance.now();
  let lastFrameTime = 0;
  let pausedAt = null;
  let playing = true;

  let resizeRaf = null;
  const resize = () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      const rect = container.getBoundingClientRect();
      // OPTIMIZATION: Force dpr = 1 to reduce shader load on Retina screens
      const dpr = 1;
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      gl.viewport(0, 0, width, height);
    });
  };

  if (typeof ResizeObserver === 'undefined') {
    return () => {
      canvas.remove();
    };
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const render = () => {
    if (!playing) return;
    const now = performance.now();
    if (now - lastFrameTime < FRAME_INTERVAL) {
      rafId = requestAnimationFrame(render);
      return;
    }
    lastFrameTime = now;
    const currentTime = (now - start) / 1000;
    gl.useProgram(program);
    gl.uniform1f(uTime, currentTime);
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    rafId = requestAnimationFrame(render);
  };

  const handleVisibility = () => {
    if (document.hidden) {
      playing = false;
      pausedAt = performance.now();
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      return;
    }
    if (pausedAt) {
      const pauseDelta = performance.now() - pausedAt;
      start += pauseDelta;
      pausedAt = null;
    }
    if (!playing) {
      playing = true;
    }
    if (!rafId) {
      rafId = requestAnimationFrame(render);
    }
  };

  document.addEventListener('visibilitychange', handleVisibility);

  render();

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    document.removeEventListener('visibilitychange', handleVisibility);
    resizeObserver.disconnect();
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);
  };
}

function initSinglePaywall(root) {
  const lockedSrc = root.dataset.lockedSrc || '';
  const body = root.querySelector('[data-locked-body]');
  const fab = document.querySelector('[data-paywall-fab]');
  const addButton = fab?.querySelector('[data-paywall-add]');
  const addLabel = addButton?.querySelector('[data-paywall-add-label]');
  const fabTimer = fab?.querySelector('[data-paywall-timer]');
  const timers = fabTimer ? [fabTimer] : [];

  const fluidHost = root.querySelector('[data-fluid-overlay]');
  const cleanupFluid = initFluidOverlay(fluidHost);

  let blocks = [];
  let cursor = 0;
  let loading = false;
  let cooldown = 0;
  let cooldownTimer = null;
  let endMarker = null;
  let hasFetched = false;
  const hint = body?.querySelector('.paywall-text__hint') || null;

  const stopCooldown = () => {
    if (cooldownTimer) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  };

  const applyTimerState = () => {
    const hasTimer = timers.length > 0;
    const showTimer = hasTimer && cooldown > 0;
    if (addButton) {
      addButton.hidden = showTimer;
      addButton.disabled = (showTimer && hasTimer) || loading;
    }
    updateTimers(timers, cooldown);
  };

  const startCooldown = () => {
    cooldown = COOLDOWN_SECONDS;
    applyTimerState();
    stopCooldown();
    cooldownTimer = window.setInterval(() => {
      cooldown = Math.max(0, cooldown - 1);
      applyTimerState();
      if (cooldown === 0) stopCooldown();
      updateButtonState();
    }, 1000);
  };

  const showError = (message) => {
    if (!body) return;
    const existing = body.querySelector('.paywall-text__error');
    if (existing) {
      existing.textContent = message;
      return;
    }
    const error = document.createElement('p');
    error.className = 'paywall-text__error';
    error.textContent = message;
    body.appendChild(error);
  };

  const showEnd = () => {
    if (!body || endMarker) return;
    endMarker = document.createElement('p');
    endMarker.className = 'paywall-text__end';
    endMarker.textContent = 'Достигнут конец статьи';
    body.appendChild(endMarker);
  };

  const appendBlock = (html) => {
    if (!body) return;
    // Используем template для корректной вставки блочных элементов (h2, div, blockquote и т.д.)
    const temp = document.createElement('template');
    temp.innerHTML = html;
    body.appendChild(temp.content);
    if (hint) hint.remove();
  };

  const updateButtonState = () => {
    if (!addButton) return;
    const noSource = !lockedSrc && blocks.length === 0;
    const isDone = (blocks.length > 0 && cursor >= blocks.length) || (hasFetched && blocks.length === 0);
    const disabled = loading || isDone || noSource || cooldown > 0;
    addButton.disabled = disabled;

    if (addLabel) {
      if (noSource) {
        addLabel.textContent = 'Источник не задан';
      } else if (loading) {
        addLabel.textContent = 'Загрузка...';
      } else if (isDone) {
        addLabel.textContent = 'Текст закончился';
      } else {
        addLabel.textContent = 'Добавить абзац';
      }
    }
  };

  const loadBlocks = async () => {
    if (blocks.length || loading) return blocks;

    // DEV MODE SIMULATION
    if (import.meta.env.DEV && !lockedSrc) {
      // Simulate network delay
      loading = true;
      updateButtonState();
      await new Promise(resolve => setTimeout(resolve, 600));

      // Return infinite array of the same paragraph for demo
      // Or just a large number of them
      blocks = Array(20).fill(DEV_SAMPLE_PARAGRAPH);
      loading = false;
      hasFetched = true;
      updateButtonState();
      return blocks;
    }

    if (!lockedSrc) return blocks;

    loading = true;
    hasFetched = true;
    updateButtonState();
    try {
      const response = await fetch(lockedSrc, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('bad response');
      const data = await response.json();
      const loadedBlocks = Array.isArray(data.blocks) ? data.blocks : [];
      blocks = loadedBlocks;
      if (!blocks.length) {
        showError('Полный текст недоступен');
      }
      return blocks;
    } catch (error) {
      console.error('[Paywall] Failed to load locked content', error);
      showError('Не удалось загрузить полный текст');
      return [];
    } finally {
      loading = false;
      updateButtonState();
    }
  };

  const handleAdd = async () => {
    if (cooldown > 0 || loading) return;
    const loaded = await loadBlocks();
    if (!loaded.length) return;
    if (cursor >= loaded.length) {
      showEnd();
      updateButtonState();
      return;
    }

    appendBlock(loaded[cursor]);
    cursor += 1;
    updateButtonState();
    if (cursor >= loaded.length) {
      showEnd();
    }
    startCooldown();
  };

  if (import.meta.env.DEV && !lockedSrc) {
    appendBlock(DEV_SAMPLE_PARAGRAPH);
    hasFetched = true;
    cursor = 1;
  }

  applyTimerState();
  updateButtonState();

  addButton?.addEventListener('click', handleAdd);

  return () => {
    stopCooldown();
    addButton?.removeEventListener('click', handleAdd);
    cleanupFluid();
  };
}

export function initDynamicPaywall() {
  const roots = document.querySelectorAll('[data-paywall-root]');
  if (!roots.length) return;
  initSinglePaywall(roots[0]);
  initCtaIconAnimation();
}

/**
 * CTA Icon Animation - cycles through cleaning tool images
 */
const CTA_ICONS = [
  '/assets/cloth.png',
  '/assets/glove.png',
  '/assets/pump_bottle.png',
  '/assets/rect_brush.png',
  '/assets/round_brush.png',
  '/assets/toilet_brush.png',
  '/assets/trigger_spray.png'
];

function initCtaIconAnimation() {
  const button = document.querySelector('.paywall-cta-button');
  const existingIcon = button?.querySelector('.paywall-cta-button__icon');
  if (!button || !existingIcon) return;

  // Create slot machine container
  const slotContainer = document.createElement('div');
  slotContainer.className = 'paywall-cta-slot';

  const slotTrack = document.createElement('div');
  slotTrack.className = 'paywall-cta-slot__track';

  // Create slot items - duplicate first item at end for seamless loop
  const allIcons = [...CTA_ICONS, CTA_ICONS[0]];

  allIcons.forEach((src) => {
    const item = document.createElement('div');
    item.className = 'paywall-cta-slot__item';
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    item.appendChild(img);
    slotTrack.appendChild(item);
  });

  slotContainer.appendChild(slotTrack);
  existingIcon.replaceWith(slotContainer);

  // Preload all images
  CTA_ICONS.forEach(src => {
    const img = new Image();
    img.src = src;
  });

  let currentIndex = 0;
  const itemHeight = 150; // Same as CSS .paywall-cta-slot__item height

  function animateToNext() {
    currentIndex++;

    // Enable smooth transition
    slotTrack.style.transition = 'transform 0.8s cubic-bezier(0.33, 1, 0.68, 1)';
    slotTrack.style.transform = `translateY(-${currentIndex * itemHeight}px)`;

    // If we reach the duplicate (last item), reset to beginning
    if (currentIndex >= CTA_ICONS.length) {
      setTimeout(() => {
        // Disable transition for instant reset
        slotTrack.style.transition = 'none';
        slotTrack.style.transform = 'translateY(0)';
        currentIndex = 0;
        // Force reflow
        void slotTrack.offsetHeight;
      }, 850); // Slightly after animation completes
    }
  }

  setInterval(animateToNext, 1800);
}
