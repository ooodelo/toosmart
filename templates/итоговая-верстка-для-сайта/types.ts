export type ThemeId = 'apple_marker';

export interface MarkerVariant {
  id: string;
  name: string;
  className: string; // The Tailwind classes for the marker
}

export interface ThemeStyles {
  id: ThemeId;
  name: string;
  description: string;
  // Layout
  wrapper: string;
  paper: string;
  
  // Typography
  fontFamily: string;
  h1: string;
  h2: string;
  h3: string;
  p: string;
  bold: string;
  italic: string;
  link: string;
  
  // Elements
  blockquote: string;
  list: string;
  listItem: string;
  marker: string;
  markerColor: string; // Background color for the marker
  hr: string;
  
  // Special Blocks
  calloutInfo: string;
  calloutIdea: string;
  calloutWarning: string;
}