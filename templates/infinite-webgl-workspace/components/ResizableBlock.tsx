
import React, { useState, useEffect } from 'react';
import { X, GripHorizontal } from 'lucide-react';
import { BlockState, DragHandleProps, AnimationType } from '../types';
import { FRAGMENT_SHADER_FLUID } from '../constants';
import WebGLView from './WebGLView';

interface ResizableBlockProps {
  block: BlockState;
  onUpdate: (id: string, updates: Partial<BlockState>) => void;
  onRemove: (id: string) => void;
  onFocus: (id: string) => void;
}

const getShader = (type: AnimationType) => {
  return FRAGMENT_SHADER_FLUID;
};

const getTitle = (type: AnimationType) => {
    return "Флюид";
}

const ResizeHandle: React.FC<DragHandleProps> = ({ onDrag, className, cursorClass }) => {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      onDrag(dx, dy);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className={`absolute z-20 ${className} ${cursorClass}`}
      onMouseDown={handleMouseDown}
    />
  );
};

export const ResizableBlock: React.FC<ResizableBlockProps> = ({ block, onUpdate, onRemove, onFocus }) => {
  const [isResizing, setIsResizing] = useState(false);
  
  // Dragging logic for the header
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    onFocus(block.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = block.x;
    const initialY = block.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      onUpdate(block.id, { x: initialX + dx, y: initialY + dy });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleResize = (dx: number, dy: number, direction: string) => {
      onFocus(block.id);
      setIsResizing(true);
      
      let newW = block.width;
      let newH = block.height;
      let newX = block.x;
      let newY = block.y;
      
      // Minimum size
      const minSize = 100;

      if (direction.includes('e')) newW = Math.max(minSize, block.width + dx);
      if (direction.includes('s')) newH = Math.max(minSize, block.height + dy);
      if (direction.includes('w')) {
          const delta = Math.min(dx, block.width - minSize);
          newW = block.width - delta;
          newX = block.x + delta;
      }
      if (direction.includes('n')) {
          const delta = Math.min(dy, block.height - minSize);
          newH = block.height - delta;
          newY = block.y + delta;
      }

      onUpdate(block.id, { x: newX, y: newY, width: newW, height: newH });
  };

  // Stop resizing flag on global mouse up
  useEffect(() => {
      const up = () => setIsResizing(false);
      window.addEventListener('mouseup', up);
      return () => window.removeEventListener('mouseup', up);
  }, []);

  return (
    <div
      className="absolute flex flex-col rounded-lg overflow-hidden shadow-2xl backdrop-blur-md bg-transparent border border-white/10 transition-shadow duration-200"
      style={{
        left: block.x,
        top: block.y,
        width: block.width,
        height: block.height,
        zIndex: block.zIndex,
        boxShadow: block.zIndex > 10 ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)' : '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
      }}
      onMouseDown={() => onFocus(block.id)}
    >
      {/* Header / Drag Area */}
      <div
        className="h-8 bg-white/5 border-b border-white/5 flex items-center justify-between px-2 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2 text-white/70 text-xs font-medium">
          <GripHorizontal size={14} />
          <span>{getTitle(block.type)}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(block.id); }}
          className="text-white/40 hover:text-red-400 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 relative w-full h-full overflow-hidden">
        <WebGLView 
            fragmentShader={getShader(block.type)} 
            width={block.width}
            height={block.height - 32} // Subtract header height
        />
        
        {/* Resize Overlay Info */}
        {isResizing && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="bg-black/60 px-2 py-1 rounded text-xs text-white/80 font-mono">
                    {Math.round(block.width)} x {Math.round(block.height)}
                </span>
            </div>
        )}
      </div>

      {/* Resize Handles */}
      {/* Corners */}
      <ResizeHandle cursorClass="cursor-nw-resize" className="-top-1 -left-1 w-3 h-3 bg-transparent hover:bg-blue-500/50 rounded-full" onDrag={(dx, dy) => handleResize(dx, dy, 'nw')} />
      <ResizeHandle cursorClass="cursor-ne-resize" className="-top-1 -right-1 w-3 h-3 bg-transparent hover:bg-blue-500/50 rounded-full" onDrag={(dx, dy) => handleResize(dx, dy, 'ne')} />
      <ResizeHandle cursorClass="cursor-sw-resize" className="-bottom-1 -left-1 w-3 h-3 bg-transparent hover:bg-blue-500/50 rounded-full" onDrag={(dx, dy) => handleResize(dx, dy, 'sw')} />
      <ResizeHandle cursorClass="cursor-se-resize" className="-bottom-1 -right-1 w-3 h-3 bg-transparent hover:bg-blue-500/50 rounded-full" onDrag={(dx, dy) => handleResize(dx, dy, 'se')} />
      
      {/* Edges */}
      <ResizeHandle cursorClass="cursor-n-resize" className="-top-1 left-2 right-2 h-2" onDrag={(dx, dy) => handleResize(dx, dy, 'n')} />
      <ResizeHandle cursorClass="cursor-s-resize" className="-bottom-1 left-2 right-2 h-2" onDrag={(dx, dy) => handleResize(dx, dy, 's')} />
      <ResizeHandle cursorClass="cursor-w-resize" className="top-2 bottom-2 -left-1 w-2" onDrag={(dx, dy) => handleResize(dx, dy, 'w')} />
      <ResizeHandle cursorClass="cursor-e-resize" className="top-2 bottom-2 -right-1 w-2" onDrag={(dx, dy) => handleResize(dx, dy, 'e')} />
    </div>
  );
};
