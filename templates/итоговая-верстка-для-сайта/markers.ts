import { MarkerVariant } from './types';

// Base class required for all markers to handle positioning and color injection
const BASE = "relative inline-block mx-1 before:content-[''] before:absolute before:bg-[var(--marker-color)] before:z-20 before:pointer-events-none";

export const markers: MarkerVariant[] = [
  // --- 1-10: Оригинальные стили ---
  {
    id: 'classic',
    name: 'Реалистичный',
    className: `${BASE} px-1 rounded-[0.5em] -skew-x-2 before:inset-0 before:rounded-[inherit]`
  },
  {
    id: 'block',
    name: 'Строгий блок',
    className: `${BASE} px-1 rounded-sm before:inset-0 before:rounded-sm`
  },
  {
    id: 'rounded',
    name: 'Пиллюля',
    className: `${BASE} px-2 rounded-full before:inset-0 before:rounded-full`
  },
  {
    id: 'soft_blur',
    name: 'Мягкий фокус',
    className: `${BASE} px-1 rounded-md before:inset-0 before:rounded-md before:blur-[3px] before:scale-110`
  },
  {
    id: 'thick_underline',
    name: 'Жирное подчеркивание',
    className: `${BASE} px-0 before:left-0 before:right-0 before:bottom-[0.1em] before:h-[0.4em] before:rounded-[2px]`
  },
  {
    id: 'thin_underline',
    name: 'Тонкая линия',
    className: `${BASE} px-0 before:left-0 before:right-0 before:bottom-0 before:h-[0.15em]`
  },
  {
    id: 'offset',
    name: 'Сдвиг',
    className: `${BASE} px-1 before:inset-0 before:translate-x-[4px] before:translate-y-[4px] before:rounded-sm`
  },
  {
    id: 'sketchy',
    name: 'Набросок',
    className: `${BASE} px-1 rounded-[2px] -rotate-1 before:inset-0 before:rounded-[30%_70%_70%_30%/_30%_30%_70%_70%] before:scale-110 before:opacity-80`
  },
  {
    id: 'strike',
    name: 'Зачеркивание',
    className: `${BASE} px-0 before:left-0 before:right-0 before:top-1/2 before:-translate-y-1/2 before:h-[0.3em] before:opacity-80`
  },
  {
    id: 'bracket',
    name: 'Вертикаль',
    className: `${BASE} px-2 before:w-[4px] before:left-0 before:top-0 before:bottom-0 before:rounded-full`
  },

  // --- 11-20: Новые стили ---
  {
    id: 'frame',
    name: 'Рамка',
    className: `${BASE} px-1 before:inset-0 before:bg-transparent before:border-2 before:border-[var(--marker-color)] before:rounded-md`
  },
  {
    id: 'dashed',
    name: 'Пунктир',
    className: `${BASE} px-1 before:inset-0 before:bg-transparent before:border-2 before:border-dashed before:border-[var(--marker-color)] before:rounded-md`
  },
  {
    id: 'brackets_x',
    name: 'Скобки',
    className: `${BASE} px-2 before:inset-0 before:bg-transparent before:border-x-2 before:border-[var(--marker-color)] before:rounded-lg`
  },
  {
    id: 'double_line',
    name: 'Двойная линия',
    className: `${BASE} px-0 before:left-0 before:right-0 before:bottom-0 before:h-[4px] before:bg-transparent before:border-b-4 before:border-double before:border-[var(--marker-color)]`
  },
  {
    id: 'half_bottom',
    name: 'Нижняя половина',
    className: `${BASE} px-1 before:left-0 before:right-0 before:bottom-0 before:top-[60%]`
  },
  {
    id: 'half_top',
    name: 'Верхняя половина',
    className: `${BASE} px-1 before:left-0 before:right-0 before:top-0 before:bottom-[60%]`
  },
  {
    id: 'ellipse',
    name: 'Овал',
    className: `${BASE} px-2 before:inset-0 before:rounded-[50%] before:scale-110 before:opacity-80`
  },
  {
    id: 'gradient_fade',
    name: 'Градиент',
    className: `${BASE} px-1 before:inset-0 before:bg-gradient-to-r before:from-[var(--marker-color)] before:to-transparent`
  },
  {
    id: 'messy_2',
    name: 'Грубый штрих',
    className: `${BASE} px-1 before:inset-0 before:rounded-[255px_15px_225px_15px/15px_225px_15px_255px] before:-rotate-2 before:scale-105`
  },
  {
    id: 'dot_under',
    name: 'Точка снизу',
    className: `${BASE} px-0 before:bg-[var(--marker-color)] before:w-2 before:h-2 before:rounded-full before:left-1/2 before:-translate-x-1/2 before:top-full before:mt-0.5`
  }
];
