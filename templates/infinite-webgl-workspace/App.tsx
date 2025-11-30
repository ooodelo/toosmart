
import React, { useState, useEffect } from 'react';
import WebGLView from './components/WebGLView';
import { FRAGMENT_SHADER_FLUID } from './constants';
import { Lock, Plus } from 'lucide-react';

const generateText = () => {
   const words = ["lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit", "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore", "magna", "aliqua", "ut", "enim", "ad", "minim", "veniam", "quis", "nostrud", "exercitation", "ullamco", "laboris", "nisi", "ut", "aliquip", "ex", "ea", "commodo", "consequat", "duis", "aute", "irure", "dolor", "in", "reprehenderit", "in", "voluptate", "velit", "esse", "cillum", "dolore", "eu", "fugiat", "nulla", "pariatur", "excepteur", "sint", "occaecat", "cupidatat", "non", "proident", "sunt", "in", "culpa", "qui", "officia", "deserunt", "mollit", "anim", "id", "est", "laborum", "fluid", "intelligence", "chaos", "order", "pattern", "recognition", "neural", "networks", "synaptic", "plasticity", "cognitive", "dissonance", "flow", "state", "dynamics", "vector", "tensor", "calculus", "limit", "infinity"];
   let result = [];
   for(let i=0; i<100; i++) {
       result.push(words[Math.floor(Math.random() * words.length)]);
   }
   const text = result.join(" ");
   return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}

function App() {
  const [extraParagraphs, setExtraParagraphs] = useState<string[]>([]);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (cooldown > 0) {
      interval = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleAddText = () => {
    if (cooldown > 0) return;
    setExtraParagraphs(prev => [...prev, generateText()]);
    setCooldown(10);
  };

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
          <div className="relative">
            
            {/* The "Locked" Content */}
            <div className="opacity-100 transition-opacity duration-1000">
              <p className="mb-6">
                To understand this, we must look at the chaotic attractors within neural networks. 
                When a mind encounters a paradox, it doesn't just halt; it swirls. It creates a temporary 
                vortex of processing power, pulling in resources from memory, sensory input, and abstract 
                reasoning. This "cognitive fluid" has viscosity, momentum, and turbulence.
              </p>
              
              <h2 className="text-2xl font-bold mt-8 mb-4">The Architecture of Thought</h2>
              
              <p className="mb-6">
                Consider the phenomenon of the "eureka" moment. It acts as a phase transition—a sudden 
                shift from a liquid, chaotic state of searching to a solid state of understanding. 
                Before the solution is found, the mind is in flux. Ideas float and drift, colliding 
                like particles in a suspension.
              </p>
              
              <p className="mb-6">
                 Research conducted at the Institute of Advanced Cognitive Studies utilized fMRI imaging 
                 to map these states. The visualizations produced were startling: distinct "islands" of 
                 high activity that would drift, merge, and separate over time, exactly like oil droplets 
                 on water or the movement of plasma.
              </p>

              <p className="mb-6">
                This raises a fundamental question about the nature of consciousness. Is our sense of self 
                merely the surface tension of this fluid? When we sleep, does the viscosity change, 
                allowing for the wild, unstructured associations of dreams? The implications for artificial 
                intelligence are profound.
              </p>
               <p className="mb-6">
                Current AI models are largely static matrices. They are vast, frozen crystals of data. 
                To achieve true general intelligence, we may need to design systems that are inherently 
                unstable, systems that can "melt" and reform based on the temperature of the problem 
                they are trying to solve.
              </p>
               <p className="mb-6">
                By modeling these digital minds on the physics of fluids rather than the logic of circuits, 
                we might unlock a new era of computing—one that is organic, adaptive, and perhaps, 
                unpredictably creative.
              </p>

              {/* Dynamic Content */}
              {extraParagraphs.map((text, i) => (
                <p key={i} className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  {text}
                </p>
              ))}
            </div>

            {/* FLUID PAYWALL OVERLAY */}
            <div className="absolute inset-0 z-10 rounded-xl select-none">
               {/* Layer 1: Visuals */}
               <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                   <WebGLView 
                     fragmentShader={FRAGMENT_SHADER_FLUID} 
                     className="w-full h-full"
                   />
               </div>

               {/* Layer 2: UI (Sticky Button) */}
               {/* 
                   We use 'h-full' to ensure the sticky element has track to move in.
                   'top-[50vh]' positions it relative to the viewport.
                   '-translate-y-1/2' centers it vertically on that line.
               */}
               <div className="absolute inset-0 w-full h-full pointer-events-none">
                  <div className="sticky top-[50vh] flex justify-center w-full transform -translate-y-1/2 z-50">
                     <button className="group pointer-events-auto flex items-center gap-4 bg-gray-900 text-white px-12 py-6 rounded-full shadow-[0_30px_100px_rgba(0,0,0,0.5)] hover:bg-black transition-all transform hover:scale-105 active:scale-95 cursor-pointer">
                        <Lock className="w-8 h-8 group-hover:text-blue-200 transition-colors" />
                        <span className="font-bold text-2xl tracking-wide">Разблокировать</span>
                     </button>
                  </div>
               </div>
            </div>

          </div>
        </div>
      </article>

      {/* Floating Action Button to Add Text */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
        {cooldown > 0 ? (
          <div className="w-12 h-12 bg-white rounded-full shadow-lg border border-gray-200 flex items-center justify-center p-1 animate-in fade-in zoom-in duration-300">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              {/* Track */}
              <path
                className="text-gray-100"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
              />
              {/* Progress Indicator */}
              <path
                className="text-gray-900 transition-[stroke-dashoffset] duration-1000 ease-linear"
                strokeDasharray="100, 100"
                strokeDashoffset={100 - (cooldown / 10) * 100}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
          </div>
        ) : (
          <button 
            onClick={handleAddText}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-full shadow-lg border border-gray-300 font-medium bg-gray-200 hover:bg-white text-gray-900 hover:scale-105 active:scale-95 transition-all w-64 animate-in fade-in zoom-in duration-300"
          >
            <Plus size={18} />
            <span>Добавить 100 слов</span>
          </button>
        )}
      </div>

    </div>
  );
}

export default App;
