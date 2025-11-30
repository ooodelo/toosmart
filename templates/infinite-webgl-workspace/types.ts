
export enum AnimationType {
  FLUID = 'FLUID'
}

export interface BlockState {
  id: string;
  type: AnimationType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface DragHandleProps {
  onDrag: (dx: number, dy: number) => void;
  className?: string;
  cursorClass: string;
}
