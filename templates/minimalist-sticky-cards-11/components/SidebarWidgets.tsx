
import React, { useState, useEffect } from 'react';
import { MOCK_CARDS } from '../types';
import { ArrowRight, ArrowLeft } from 'lucide-react';

interface StackWidgetProps {
  isMobile?: boolean;
}

// --- WIDGET: THE INFINITE STACK ---
export const StackWidget: React.FC<StackWidgetProps> = ({ isMobile = false }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

  // Touch State
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Auto-play loop
  useEffect(() => {
    if (isHovered) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % MOCK_CARDS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isHovered]);

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveIndex((prev) => (prev + 1) % MOCK_CARDS.length);
  };

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveIndex((prev) => (prev - 1 + MOCK_CARDS.length) % MOCK_CARDS.length);
  };

  // Touch Handlers for Swipe
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;
    
    if (isLeftSwipe) {
      setActiveIndex((prev) => (prev + 1) % MOCK_CARDS.length);
    }
    if (isRightSwipe) {
      setActiveIndex((prev) => (prev - 1 + MOCK_CARDS.length) % MOCK_CARDS.length);
    }
  };

  // Helper to calculate visual properties
  const getCardStyle = (index: number) => {
    const total = MOCK_CARDS.length;
    // Calculate "offset" - how far down (or right) the stack is this card?
    const offset = (index - activeIndex + total) % total;
    
    // --- CONFIG ---
    // Desktop (Vertical) vs Mobile (Horizontal/Depth)
    const STEP_Y = isMobile ? 0 : 14; 
    const STEP_X = isMobile ? 24 : 0; // Mobile perspective spacing
    const SCALE_STEP = 0.05;

    // --- ANIMATION VARIABLES ---
    // Start State (Current Offset)
    const yStart = offset * STEP_Y;
    const xStart = offset * STEP_X;
    const scaleStart = 1 - (offset * SCALE_STEP);
    
    // End State (Driving to Offset - 1)
    const yEnd = isMobile ? 0 : Math.max(0, (offset - 1) * STEP_Y);
    const xEnd = isMobile ? Math.max(0, (offset - 1) * STEP_X) : 0;
    const scaleEnd = Math.min(1, 1 - ((offset - 1) * SCALE_STEP));

    // --- EXPANDED STATE CONFIG (Desktop Only) ---
    const expandedYOffset = `calc(${offset} * ((100vh - 460px) / 3))`;
    const isCardHovered = isHovered && MOCK_CARDS[index].id === hoveredCardId;

    // CSS Variables for the animation
    const cssVars = {
        '--x-from': `${xStart}px`,
        '--y-from': `${yStart}px`,
        '--x-to': `${xEnd}px`,
        '--y-to': `${yEnd}px`,
        '--s-from': `${scaleStart}`,
        '--s-to': `${scaleEnd}`,
        '--z-start': `-${offset}px`,
        '--z-end': `-${Math.max(0, offset - 1)}px`,
    } as React.CSSProperties;

    // --- STYLE LOGIC ---
    let style: React.CSSProperties = {
        ...cssVars,
        zIndex: isCardHovered ? 100 : 50 - offset,
        willChange: 'transform, opacity',
    };

    if (isMobile) {
        // --- MOBILE LOGIC ---
        // Offset 0: Active Card (Static, Calm)
        // Offset Last: The card that JUST left (Fly Out)
        // Offset 1..N: Stack (Driving forward)

        if (offset === 0) {
            // STATIC ACTIVE
            style = {
                ...style,
                transform: 'translate3d(0,0,0) scale(1)',
                zIndex: 50,
                opacity: 1,
            };
        } else if (offset === total - 1) {
            // EXIT ANIMATION (Fly Out)
            style = {
                ...style,
                zIndex: 60, // Fly OVER the new active card
                animation: 'flyOutMobile 800ms cubic-bezier(0.32, 0.72, 0, 1) forwards',
            };
        } else {
            // STACK APPROACH (Timer)
            // Interpolate from current Pos to Pos-1
            const animName = activeIndex % 2 === 0 ? 'stackApproachEven' : 'stackApproachOdd';
            style = {
                ...style,
                zIndex: 40 - offset,
                animation: `${animName} 4000ms linear forwards`,
            };
        }

    } else {
        // --- DESKTOP LOGIC ---
        if (isHovered) {
            // EXPANDED SELECTION MODE
            style = {
                ...style,
                transform: `translate3d(0, ${expandedYOffset}, 0) scale(1)`,
                opacity: 1,
                transition: 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 0.3s ease',
                boxShadow: isCardHovered 
                    ? '0 30px 60px -12px rgba(0,0,0,0.25)' 
                    : '0 10px 40px -10px rgba(0,0,0,0.05)',
            };
        } else {
            // COLLAPSED MODE (Timer)
            if (offset === 0) {
                // Static Top Card
                style = {
                    ...style,
                    transform: `translate3d(0, 0, 0) scale(1)`,
                    opacity: 1,
                    transition: 'none', 
                };
            } else {
                // Stack Driving Up
                const animName = activeIndex % 2 === 0 ? 'stackRiseEven' : 'stackRiseOdd';
                style = {
                    ...style,
                    animation: `${animName} 4000ms linear forwards`,
                };
            }
        }
    }

    return {
        style,
        pointerEvents: (offset === 0 || (isHovered && !isMobile)) ? 'auto' : 'none',
    };
  };

  return (
    <>
      <style>
        {`
          /* DESKTOP ANIMATIONS */
          @keyframes stackRiseEven {
            from { transform: translate3d(var(--x-from), var(--y-from), var(--z-start)) scale(var(--s-from)); }
            to { transform: translate3d(var(--x-to), var(--y-to), var(--z-end)) scale(var(--s-to)); }
          }
          @keyframes stackRiseOdd {
            from { transform: translate3d(var(--x-from), var(--y-from), var(--z-start)) scale(var(--s-from)); }
            to { transform: translate3d(var(--x-to), var(--y-to), var(--z-end)) scale(var(--s-to)); }
          }

          /* MOBILE ANIMATIONS */
          @keyframes stackApproachEven {
            from { transform: translate3d(var(--x-from), var(--y-from), var(--z-start)) scale(var(--s-from)); }
            to { transform: translate3d(var(--x-to), var(--y-to), var(--z-end)) scale(var(--s-to)); }
          }
          @keyframes stackApproachOdd {
            from { transform: translate3d(var(--x-from), var(--y-from), var(--z-start)) scale(var(--s-from)); }
            to { transform: translate3d(var(--x-to), var(--y-to), var(--z-end)) scale(var(--s-to)); }
          }
          @keyframes flyOutMobile {
            0% { transform: translate3d(0,0,0) rotate(0deg) scale(1); opacity: 1; }
            100% { transform: translate3d(-120vw, 0, 0) rotate(-15deg) scale(0.9); opacity: 0; }
          }
        `}
      </style>
      
      <div className="flex flex-col gap-8 w-full">
        <div 
            className="relative w-full perspective-1000 group select-none"
            style={{ 
            height: isHovered && !isMobile ? 'calc(100vh - 150px)' : '320px', 
            transition: 'height 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)' 
            }}
            onMouseEnter={() => !isMobile && setIsHovered(true)}
            onMouseLeave={() => {
            if (!isMobile) {
                setIsHovered(false);
                setHoveredCardId(null);
            }
            }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onClick={(e) => {
                if (isMobile) {
                    handleNext(e);
                }
            }}
        >

            <div className="relative w-full h-full">
            {MOCK_CARDS.map((card, index) => {
                const { style, pointerEvents } = getCardStyle(index);
                const isCardHovered = isHovered && card.id === hoveredCardId;

                return (
                    <div
                    key={card.id}
                    className={`absolute top-0 left-0 w-full bg-white rounded-[32px] p-8 border border-white flex flex-col overflow-hidden cursor-pointer group/card ${isCardHovered ? 'border-stone-200' : 'shadow-soft-xl'}`}
                    style={{
                        ...style,
                        pointerEvents: pointerEvents as any,
                        height: '280px',
                        transformOrigin: isMobile ? '50% 100%' : '50% 50%', 
                    }}
                    onClick={(e) => {
                        if (isHovered && !isMobile) {
                            e.stopPropagation();
                            setActiveIndex(index);
                        } else if (!isMobile) {
                            handleNext(e);
                        }
                    }}
                    onMouseEnter={() => !isMobile && setHoveredCardId(card.id)}
                    onMouseLeave={() => !isMobile && setHoveredCardId(null)}
                    >
                    
                    <div className="w-full h-full flex flex-col transition-transform duration-300 ease-out relative z-10">
                        <div className="flex justify-between items-start mb-6">
                            <span className="text-5xl filter drop-shadow-sm">{card.emoji}</span>
                        </div>
                        
                        <div className="flex-1">
                            <h3 className="font-serif text-3xl text-stone-800 leading-[0.9] mb-4 tracking-tight min-h-[1.8em]">
                                {card.title}
                            </h3>
                            
                            <div className="flex items-start gap-2">
                            <div className="h-[1px] w-4 bg-accent mt-2 shrink-0"></div>
                            <p className="font-sans text-[11px] text-stone-400 font-medium uppercase tracking-wide line-clamp-3 min-h-[3.5em]">
                                {card.description}
                            </p>
                            </div>
                        </div>
                    </div>
                    </div>
                );
            })}
            </div>

            {/* Navigation Controls (Desktop Only - Inside Container) */}
            {!isMobile && (
                <div className={`absolute left-0 right-0 flex justify-center gap-8 transition-opacity duration-300 z-[120] ${isHovered ? 'bottom-0 opacity-100 delay-100' : '-bottom-4 opacity-0 pointer-events-none'}`}>
                <button 
                    onClick={handlePrev} 
                    className="p-4 bg-white rounded-full shadow-lg text-stone-800 hover:scale-110 active:scale-95 transition-transform border border-stone-100"
                >
                    <ArrowLeft size={20} />
                </button>
                <button 
                    onClick={handleNext}
                    className="p-4 bg-white rounded-full shadow-lg text-stone-800 hover:scale-110 active:scale-95 transition-transform border border-stone-100"
                >
                    <ArrowRight size={20} />
                </button>
                </div>
            )}
            
            {/* Mobile Swipe Hint */}
            {isMobile && (
                <div className="absolute -bottom-8 left-0 right-0 text-center opacity-40">
                    <span className="text-[9px] uppercase tracking-widest text-stone-400">Swipe</span>
                </div>
            )}
        </div>

        {/* Mobile Controls (Outside Container) */}
        {isMobile && (
            <div className="flex justify-center gap-16 mt-4 relative z-50">
                <button 
                    onClick={handlePrev} 
                    className="p-4 bg-white/80 backdrop-blur-sm rounded-full shadow-soft-xl border border-stone-100 active:scale-90 transition-all text-stone-600 hover:text-stone-900"
                    aria-label="Previous card"
                >
                    <ArrowLeft size={20} strokeWidth={1.5} />
                </button>
                <button 
                    onClick={handleNext}
                    className="p-4 bg-white/80 backdrop-blur-sm rounded-full shadow-soft-xl border border-stone-100 active:scale-90 transition-all text-stone-600 hover:text-stone-900"
                    aria-label="Next card"
                >
                    <ArrowRight size={20} strokeWidth={1.5} />
                </button>
            </div>
        )}
      </div>
    </>
  );
}
