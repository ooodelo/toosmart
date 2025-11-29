

export interface CardData {
  id: string;
  title: string;
  description: string;
  emoji: string;
  variant: 'glass' | 'soft' | 'wireframe' | 'mesh';
}

export const MOCK_CARDS: CardData[] = [
  {
    id: '1',
    title: 'Focus On The Breath',
    description: 'Breathe deeply to find your center and peace.',
    emoji: '🌬️',
    variant: 'soft'
  },
  {
    id: '2',
    title: 'Create Without Boundaries',
    description: 'True art never asks for anyone\'s permission first.',
    emoji: '🎨',
    variant: 'glass'
  },
  {
    id: '3',
    title: 'Silence Is Golden',
    description: 'Stop and listen carefully to the heavy silence.',
    emoji: '🤫',
    variant: 'wireframe'
  },
  {
    id: '4',
    title: 'Move With Purpose',
    description: 'Your daily actions will define your future path.',
    emoji: '🐆',
    variant: 'mesh'
  },
  {
    id: '5',
    title: 'Seek Inner Light',
    description: 'Let your inner light shine bright for everyone.',
    emoji: '✨',
    variant: 'soft'
  },
  {
    id: '6',
    title: 'Embrace The Unknown',
    description: 'Step continually into the vast and beautiful unknown.',
    emoji: '🌌',
    variant: 'glass'
  },
  {
    id: '7',
    title: 'Flow Like Water',
    description: 'Adapt quickly and flow like water around obstacles.',
    emoji: '🌊',
    variant: 'soft'
  }
];