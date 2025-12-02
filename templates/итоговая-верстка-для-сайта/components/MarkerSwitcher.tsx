import React, { useState } from 'react';
import { Highlighter, ChevronDown, Check } from 'lucide-react';
import { markers } from '../markers';

interface MarkerSwitcherProps {
  currentMarkerId: string;
  onMarkerChange: (markerId: string) => void;
}

const MarkerSwitcher: React.FC<MarkerSwitcherProps> = ({ currentMarkerId, onMarkerChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOpen = () => setIsOpen(!isOpen);
  const currentMarker = markers.find(m => m.id === currentMarkerId) || markers[0];

  // Hardcoded preview color to match the theme's orange
  const previewStyle = { '--marker-color': 'rgba(250, 148, 80, 0.5)' } as React.CSSProperties;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end font-sans">
      
      {/* Dropdown Menu */}
      <div 
        className={`
          mb-4 bg-white/95 backdrop-blur-xl shadow-[0_20px_60px_-10px_rgba(0,0,0,0.15)] 
          rounded-2xl overflow-hidden border border-white/50
          transition-all duration-300 origin-bottom-right
          ${isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4 pointer-events-none'}
        `}
        style={{ width: '320px' }}
      >
        <div className="px-5 py-3 bg-gray-50/80 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Стиль выделения</h3>
          <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">
            {markers.length}
          </span>
        </div>
        
        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
          {markers.map((marker) => {
            const isActive = currentMarkerId === marker.id;
            return (
              <button
                key={marker.id}
                onClick={() => {
                  onMarkerChange(marker.id);
                  setIsOpen(false);
                }}
                className={`
                  w-full text-left px-4 py-3 rounded-xl transition-all duration-200
                  grid grid-cols-[1fr_60px] items-center gap-2 group relative
                  ${isActive 
                    ? 'bg-orange-50 text-gray-900 ring-1 ring-orange-200/50' 
                    : 'hover:bg-gray-50 text-gray-600 hover:text-gray-900'
                  }
                `}
              >
                {/* Left Column: Name and Icon */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`
                    w-4 h-4 rounded-full border flex items-center justify-center transition-colors shrink-0
                    ${isActive ? 'border-orange-400 bg-orange-400 text-white' : 'border-gray-300 group-hover:border-gray-400'}
                  `}>
                    {isActive && <Check size={10} strokeWidth={4} />}
                  </div>
                  <span className={`text-[13px] truncate ${isActive ? 'font-semibold' : 'font-medium'}`}>
                    {marker.name}
                  </span>
                </div>

                {/* Right Column: Live Preview (Centered) */}
                <div className="flex justify-center items-center opacity-90 h-6">
                  <span className={`${marker.className} text-sm font-serif text-gray-900`} style={previewStyle}>
                    Aa
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Trigger Button */}
      <button
        onClick={toggleOpen}
        className={`
          h-14 pl-6 pr-8 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] 
          flex items-center gap-3 transition-all duration-300 
          bg-[#1d1d1f] text-white hover:bg-black hover:scale-105 active:scale-95
        `}
        aria-label="Change Marker"
      >
        <div className="bg-white/10 p-2 rounded-full">
          <Highlighter size={18} className="text-white" />
        </div>
        <div className="flex flex-col items-start leading-none">
          <span className="text-[10px] opacity-60 font-medium uppercase tracking-wider mb-0.5">Стиль</span>
          <span className="font-semibold text-sm">{currentMarker.name}</span>
        </div>
        <ChevronDown 
          size={16} 
          className={`absolute right-5 transition-transform duration-300 opacity-60 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>
    </div>
  );
};

export default MarkerSwitcher;