
import React, { useState, useEffect } from 'react';
import { ArticleContent } from './components/ArticleContent';
import { StackWidget } from './components/SidebarWidgets.tsx';
import { Menu, Search } from 'lucide-react';

export default function App() {
  const [scrolled, setScrolled] = useState(false);

  // Subtle navbar effect
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-canvas text-stone-800 selection:bg-accent selection:text-stone-900">
      
      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'py-4 bg-white/80 backdrop-blur-md shadow-sm' : 'py-8 bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
             <div className="w-8 h-8 rounded-full border border-stone-300 flex items-center justify-center cursor-pointer hover:bg-stone-900 hover:text-white hover:border-transparent transition-all">
                <Menu size={14} />
             </div>
             <span className="font-serif italic font-semibold text-lg tracking-tight">Kiyoshi.</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="hidden md:block text-xs font-medium uppercase tracking-widest text-stone-400">Journal v.2.0</span>
            <Search size={18} className="text-stone-400 cursor-pointer hover:text-stone-900 transition-colors" />
          </div>
        </div>
      </nav>

      {/* 
          FIXED WIDGET LAYER 
          This layer sits on top of the content, fixed to the viewport.
          It uses the same grid constraints to align the widget perfectly 
          in the "Right Column" slot, but ensures it NEVER scrolls.
      */}
      <div className="fixed inset-0 pointer-events-none z-40 flex flex-col justify-start pt-32">
        <div className="w-full max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 h-full">
            {/* Empty columns to match layout */}
            <div className="hidden lg:block lg:col-span-9"></div>
            
            {/* Target Column: Widget lives here */}
            <div className="hidden lg:flex lg:col-span-3 lg:col-start-10 flex-col justify-start h-full relative pointer-events-auto">
               <div className="flex items-center justify-between opacity-80 mb-8 absolute -top-12 w-full left-0">
                  <span className="text-lg font-black font-mono tracking-widest text-stone-400">🔥 РЕКОМЕНДАЦИИ</span>
                </div>
               <StackWidget />
            </div>
        </div>
      </div>

      {/* Main Grid Layout (Scrolling Content) */}
      <div className="max-w-7xl mx-auto px-6 pt-32 pb-20 relative z-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 relative">
          
          {/* Left Column (Spacer / TOC) - 2 cols */}
          <aside className="hidden lg:block lg:col-span-2">
            <div className="sticky top-32 space-y-4 opacity-40 hover:opacity-100 transition-opacity duration-500">
              <p className="text-xs uppercase tracking-widest font-bold mb-6 text-accent-dark">Contents</p>
              <ul className="space-y-3 text-sm font-medium border-l border-stone-200 pl-4">
                <li className="text-stone-900 cursor-pointer">Introduction</li>
                <li className="text-stone-400 hover:text-stone-800 cursor-pointer transition-colors">The Silence</li>
                <li className="text-stone-400 hover:text-stone-800 cursor-pointer transition-colors">Soft Structure</li>
                <li className="text-stone-400 hover:text-stone-800 cursor-pointer transition-colors">Mobile Zen</li>
              </ul>
            </div>
          </aside>

          {/* Center Column (Content) - 6 cols */}
          <main className="lg:col-span-6 lg:col-start-4 lg:col-end-9 min-h-screen">
            <ArticleContent />
          </main>

          {/* Right Column (Placeholder) - 3 cols 
              This keeps the grid structure intact so the text doesn't flow 
              into the space where the fixed widget is floating.
          */}
          <aside className="hidden lg:block lg:col-span-3 lg:col-start-10 min-h-screen">
             {/* Empty layout placeholder */}
          </aside>

          {/* Mobile Widget Fallback (Inline) */}
          <div className="lg:hidden mt-12 mb-12 relative z-50">
             <div className="flex items-center justify-between opacity-80 mb-8">
                <span className="text-lg font-black font-mono tracking-widest text-stone-400">🔥 РЕКОМЕНДАЦИИ</span>
              </div>
             <StackWidget isMobile={true} />
          </div>

        </div>
      </div>
    </div>
  );
}
