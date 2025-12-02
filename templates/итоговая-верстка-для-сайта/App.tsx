import React from 'react';
import { themes } from './themes';
import ContentBlock from './components/ContentBlock';

function App() {
  // Фиксируем тему
  const currentTheme = themes['apple_marker'];

  // Статичный стиль маркера:
  // 1. relative inline-block: контейнер
  // 2. before:absolute before:inset-0: слой краски поверх текста
  // 3. before:z-20: поверх текста
  // 4. before:mix-blend-multiply: режим наложения (умножение) для эффекта маркера
  // 5. before:blur-[4px]: увеличенное размытие (было 3px) для мягкости
  // 6. before:scale-110: чуть шире текста
  const markerClassName = "relative inline-block mx-1 px-1 rounded-md before:content-[''] before:absolute before:bg-[var(--marker-color)] before:z-20 before:pointer-events-none before:mix-blend-multiply before:inset-0 before:rounded-md before:blur-[4px] before:scale-110";

  return (
    <div className="min-h-screen relative font-sans text-gray-900">
      
      {/* Background */}
      <div className="fixed inset-0 -z-10 bg-[#f5f5f5]" />

      <main className={`relative w-full ${currentTheme.wrapper}`}>
        {/* The Paper/Card container */}
        <div className={currentTheme.paper}>
          <ContentBlock 
            theme={currentTheme} 
            markerClassName={markerClassName}
          />
        </div>
      </main>

    </div>
  );
}

export default App;