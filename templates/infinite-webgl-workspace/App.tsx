
import React, { useState, useEffect } from 'react';
import WebGLView from './components/WebGLView';
import { FRAGMENT_SHADER_FLUID } from './constants';
import { Lock, Plus } from 'lucide-react';

const PAYWALL_COOLDOWN = 15; // seconds
const TIMER_SEGMENTS = 8;
const PAYWALL_CTA_LABEL = 'Разблокировать'; // replace from admin/config when wiring up
const FULL_TEXT_URL = '/full-article.json';

const buildTimerGradient = (activeSegments: number) => {
  const segmentAngle = 360 / TIMER_SEGMENTS;
  const gap = 3; // degrees between slices for readability
  const stops: string[] = [];

  for (let i = 0; i < TIMER_SEGMENTS; i++) {
    const start = i * segmentAngle;
    const end = start + segmentAngle - gap;
    const fill = i < activeSegments ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0)';
    stops.push(`${fill} ${start}deg ${end}deg`);
    stops.push(`rgba(0,0,0,0) ${end}deg ${(i + 1) * segmentAngle}deg`);
  }

  return {
    backgroundImage: `conic-gradient(${stops.join(',')})`,
  };
};

function App() {
  const [extraParagraphs, setExtraParagraphs] = useState<string[]>([]);
  const [lockedSource, setLockedSource] = useState<string[]>([]);
  const [paragraphCursor, setParagraphCursor] = useState(0);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const fetchLockedContent = async () => {
    if (lockedSource.length || isLoadingSource) return lockedSource;
    setIsLoadingSource(true);
    setLoadError(null);
    try {
      const response = await fetch(FULL_TEXT_URL);
      if (!response.ok) {
        throw new Error('Failed to load');
      }
      const data = await response.json();
      const paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs : [];
      setLockedSource(paragraphs);
      return paragraphs;
    } catch (err) {
      console.error('Failed to fetch full article text', err);
      setLoadError('Не удалось загрузить полный текст');
      return [];
    } finally {
      setIsLoadingSource(false);
    }
  };

  const handleAddParagraph = async () => {
    if (cooldown > 0 || isLoadingSource) return;

    const paragraphs = await fetchLockedContent();
    if (!paragraphs.length) return;

    if (paragraphCursor >= paragraphs.length) return;

    const nextParagraph = paragraphs[paragraphCursor];
    if (!nextParagraph) return;

    setExtraParagraphs((prev) => [...prev, nextParagraph]);
    setParagraphCursor((prev) => prev + 1);
    setCooldown(PAYWALL_COOLDOWN);
  };

  const handleUnlock = () => {
    // Keep existing payment behavior; wire to your paywall/payment opener
    if (typeof (window as any).openPayment === 'function') {
      (window as any).openPayment();
      return;
    }
    console.log('Trigger payment flow');
  };

  const hasReachedEnd = lockedSource.length > 0 && paragraphCursor >= lockedSource.length;
  const activeSegments = Math.ceil((cooldown / PAYWALL_COOLDOWN) * TIMER_SEGMENTS);

  return (
    <div className="min-h-screen w-full bg-[#f5f5f5] text-gray-900 font-serif antialiased selection:bg-gray-300">
      
      {/* Article Container */}
      <article className="max-w-2xl mx-auto px-6 py-12 md:py-20">
        
        {/* Header */}
        <header className="mb-8">
          <span className="text-xs font-sans font-bold tracking-widest uppercase text-gray-400 mb-2 block">
            Science & Nature
          </span>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-4 text-gray-900">
            The Hidden Dynamics of Fluid Intelligence
          </h1>
          <div className="flex items-center gap-4 text-sm text-gray-500 font-sans border-b border-gray-200 pb-8">
            <span className="font-semibold text-gray-900">Dr. Alex Sterling</span>
            <span>•</span>
            <span>October 24, 2024</span>
            <span>•</span>
            <span>6 min read</span>
          </div>
        </header>

        {/* Content */}
        <div className="prose prose-lg prose-gray max-w-none">
          {/* Visible Paragraph (Hook) */}
          <p className="lead text-xl text-gray-700 leading-relaxed mb-6">
            Imagine a world where thought itself flows like a liquid, adapting to the container of circumstance. 
            Unlike crystallized knowledge, which stands rigid and unchanging, fluid intelligence is the river that 
            carves new canyons through the bedrock of the unknown. It is the ability to perceive relationships 
            independent of previous specific practice or instruction concerning those relationships.
          </p>

          <p className="mb-6">
            Recent studies in neuroplasticity suggest that this cognitive state is not merely a metaphor but a 
            physiological reality. The synaptic pathways in the brain, when engaged in novel problem-solving, 
            exhibit behavior remarkably similar to turbulent flow dynamics found in nature.
          </p>

          {/* Paywall Section */}
          <div className="relative rounded-xl overflow-hidden">
            <section 
              className="relative z-10 bg-white/60 backdrop-blur-sm border border-gray-200 rounded-xl p-6 md:p-8 shadow-lg"
              aria-label="Заблокированный фрагмент"
            >
              <div className="flex items-center justify-between gap-4 mb-6">
                <p className="text-sm font-semibold tracking-wide text-gray-600 uppercase">Премиум контент</p>
                {cooldown > 0 && (
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={buildTimerGradient(activeSegments)}
                    aria-label="Таймер добавления абзаца"
                  />
                )}
              </div>

              <div className="space-y-4 text-gray-800" aria-live="polite">
                {extraParagraphs.length === 0 && (
                  <p className="text-gray-500 italic">
                    Нажмите «Добавить абзац», чтобы подгрузить следующую часть полной версии статьи.
                  </p>
                )}
                {extraParagraphs.map((text, i) => (
                  <p key={i} className="mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {text}
                  </p>
                ))}
                {hasReachedEnd && (
                  <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                    Достигнут конец статьи
                  </p>
                )}
                {loadError && (
                  <p className="text-sm text-red-600 font-semibold">
                    {loadError}
                  </p>
                )}
              </div>
            </section>

            {/* FLUID PAYWALL OVERLAY */}
            <div className="absolute inset-0 z-20 rounded-xl select-none">
               <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                   <WebGLView 
                     fragmentShader={FRAGMENT_SHADER_FLUID} 
                     className="w-full h-full"
                   />
               </div>

               <div className="absolute inset-0 w-full h-full pointer-events-none">
                  <div className="sticky top-[50vh] flex justify-center w-full transform -translate-y-1/2 z-50">
                     <button 
                      onClick={handleUnlock}
                      className="group pointer-events-auto flex items-center gap-3 bg-gray-900 text-white px-8 py-4 rounded-full shadow-[0_25px_90px_rgba(0,0,0,0.55)] hover:bg-black transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
                    >
                        <Lock className="w-6 h-6 group-hover:text-blue-200 transition-colors" />
                        <span className="font-bold text-xl tracking-wide">{PAYWALL_CTA_LABEL}</span>
                     </button>
                  </div>
               </div>
            </div>

          </div>
        </div>
      </article>

      {/* Floating Action Button to Add Text */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
        <button 
          onClick={handleAddParagraph}
          disabled={cooldown > 0 || isLoadingSource || hasReachedEnd}
          className={`flex items-center justify-center gap-3 px-6 py-3 rounded-full shadow-lg border border-gray-300 font-medium bg-gray-900 text-white hover:bg-black hover:scale-105 active:scale-95 transition-all w-64 animate-in fade-in zoom-in duration-300 ${ (cooldown > 0 || isLoadingSource || hasReachedEnd) ? 'opacity-70 cursor-not-allowed' : '' }`}
        >
          {cooldown > 0 && (
            <span 
              className="w-3 h-3 rounded-full bg-black/5"
              style={buildTimerGradient(activeSegments)}
              aria-label="Таймер добавления абзаца"
            />
          )}
          <Plus size={18} />
          <span>{hasReachedEnd ? 'Текст закончился' : 'Добавить абзац'}</span>
        </button>
      </div>

    </div>
  );
}

export default App;
