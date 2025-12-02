import { ThemeStyles } from './types';

const BASE_TRANSITION = "transition-all duration-500 ease-in-out";

// Common style string for apple_marker callouts to avoid repetition
const APPLE_MARKER_CALLOUT_BASE = `
  relative flex gap-5 items-start rounded-[32px] p-8 my-12 overflow-hidden z-0
  shadow-[0_8px_40px_-8px_rgba(213,216,232,0.9)] transition-all
  before:absolute before:-inset-[150%] before:content-[''] 
  before:bg-[conic-gradient(from_0deg,transparent_0deg,transparent_60deg,#D5D8E8_140deg,transparent_200deg)] 
  before:animate-border-spin before:-z-20 before:opacity-100
  after:absolute after:inset-[1.5px] after:content-[''] after:bg-[#f5f5f5] after:rounded-[30.5px] after:-z-10
  [&_svg]:hidden
  [&_h4]:text-[#1d1d1f] [&_h4]:font-bold [&_h4]:text-2xl [&_h4]:mb-2 relative
  [&_span]:text-[21px] [&_span]:leading-relaxed [&_span]:font-medium [&_span]:text-[#1d1d1f] relative
`;

export const themes: Record<string, ThemeStyles> = {
  apple_marker: {
    id: 'apple_marker',
    name: 'Минимализм (Marker)',
    description: 'Пастельные плашки и рукописный маркер.',
    wrapper: "max-w-2xl mx-auto py-16 px-6",
    paper: `bg-transparent ${BASE_TRANSITION}`, 
    fontFamily: "font-sans text-[#1d1d1f]",
    h1: "text-4xl sm:text-6xl font-semibold mb-10 leading-[1.05] tracking-tight text-[#1d1d1f]",
    h2: "text-3xl sm:text-4xl font-semibold mt-20 mb-6 leading-[1.1]",
    h3: "text-xl font-semibold mt-10 mb-3",
    p: "text-[19px] sm:text-[21px] leading-[1.5] mb-6 text-[#1d1d1f] font-normal tracking-[0.01em]",
    bold: "font-semibold",
    italic: "italic text-gray-500",
    link: "text-[#0066cc] hover:underline cursor-pointer",
    blockquote: "text-2xl sm:text-3xl font-semibold leading-tight my-16 text-center text-[#1d1d1f] tracking-tight",
    list: "list-none pl-0 mb-8 space-y-4",
    listItem: "text-[19px] sm:text-[21px] flex items-start gap-3 before:content-['•'] before:text-[#86868b]",
    // Marker is now handled in App.tsx via props, but we keep the property for type safety if needed.
    marker: "", 
    // Decreased opacity from 0.5 to 0.4 for 10% more transparency
    markerColor: "rgba(250, 148, 80, 0.4)", 
    hr: "border-[#d2d2d7] my-16",
    calloutInfo: `${APPLE_MARKER_CALLOUT_BASE} [&_.shrink-0]:before:content-['📌'] [&_.shrink-0]:before:text-4xl`,
    calloutIdea: `${APPLE_MARKER_CALLOUT_BASE} [&_.shrink-0]:before:content-['💡'] [&_.shrink-0]:before:text-4xl`,
    calloutWarning: `${APPLE_MARKER_CALLOUT_BASE} [&_.shrink-0]:before:content-['✋'] [&_.shrink-0]:before:text-4xl`,
  }
};