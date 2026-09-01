'use client';

// BOKA OS — Resizable Split (v0.3.19)
// Wraps two panels with a draggable divider in the middle.
// The split ratio is shared across all instances via a Zustand-like singleton,
// so Chat and Debate use the same divider position.
//
// Usage:
//   <ResizableSplit left={<ChatPanel />} right={<GraphPanel />} />
//
// The divider is 2px wide, cyan on hover, draggable with mouse.
// Min panel width: 280px (left), 300px (right).

import { useState, useRef, useEffect, useCallback } from 'react';

// Shared split ratio (0.5 = 50/50) — singleton, persists for session
let sharedRatio = 0.5;
const listeners = new Set<(r: number) => void>();

function setSharedRatio(r: number) {
  sharedRatio = Math.max(0.2, Math.min(0.8, r));
  listeners.forEach(fn => fn(sharedRatio));
}

function useSharedRatio() {
  const [ratio, setRatio] = useState(sharedRatio);
  useEffect(() => {
    listeners.add(setRatio);
    return () => { listeners.delete(setRatio); };
  }, []);
  return ratio;
}

interface Props {
  left: React.ReactNode;
  right: React.ReactNode;
  minLeft?: number;  // px
  minRight?: number; // px
}

export function ResizableSplit({ left, right, minLeft = 280, minRight = 300 }: Props) {
  const ratio = useSharedRatio();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const w = rect.width;
      // Clamp to min widths
      const minLeftRatio = minLeft / w;
      const minRightRatio = 1 - minRight / w;
      let r = x / w;
      r = Math.max(minLeftRatio, Math.min(minRightRatio, r));
      setSharedRatio(r);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    // Disable text selection while dragging
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, minLeft, minRight]);

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden relative">
      {/* Left panel */}
      <div
        className="h-full overflow-hidden"
        style={{ width: `${ratio * 100}%`, minWidth: `${minLeft}px` }}
      >
        {left}
      </div>

      {/* Divider */}
      <div
        className={`shrink-0 w-px bg-[#2a2a3a] relative cursor-col-resize group transition-colors ${
          isDragging ? 'bg-[#00f5d4]' : 'hover:bg-[#00f5d4]/50'
        }`}
        onMouseDown={handleMouseDown}
        style={{ width: isDragging ? '3px' : '1px' }}
      >
        {/* Wider hit area (invisible) */}
        <div className="absolute inset-y-0 -left-1.5 -right-1.5" onMouseDown={handleMouseDown} />
        {/* Visual indicator dots */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5">
          <div className={`w-1 h-1 rounded-full ${isDragging ? 'bg-[#00f5d4]' : 'bg-[#4a4a5e] group-hover:bg-[#00f5d4]'}`} />
          <div className={`w-1 h-1 rounded-full ${isDragging ? 'bg-[#00f5d4]' : 'bg-[#4a4a5e] group-hover:bg-[#00f5d4]'}`} />
          <div className={`w-1 h-1 rounded-full ${isDragging ? 'bg-[#00f5d4]' : 'bg-[#4a4a5e] group-hover:bg-[#00f5d4]'}`} />
        </div>
      </div>

      {/* Right panel */}
      <div
        className="flex-1 h-full overflow-hidden"
        style={{ minWidth: `${minRight}px` }}
      >
        {right}
      </div>
    </div>
  );
}
