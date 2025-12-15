import { useState, useRef, useEffect } from 'react';

const slides = [
  {
    id: 1,
    icon: '🧪',
    title: 'ХИМИЯ УБОРКИ',
    description: 'Как работают моющие средства и почему не все они одинаково полезны'
  },
  {
    id: 2,
    icon: '💰',
    title: 'ЭКОНОМИЯ',
    description: 'Сколько денег вы переплачиваете за красивые этикетки и маркетинг'
  },
  {
    id: 3,
    icon: '🌱',
    title: 'ЭКО МАРКЕТИНГ',
    description: 'Почему ваше «натуральное» средство обманывает вашу совесть и природу'
  },
  {
    id: 4,
    icon: '🧽',
    title: 'ИНСТРУМЕНТЫ',
    description: 'Какие губки и тряпки реально работают, а какие просто занимают место'
  },
  {
    id: 5,
    icon: '⚡',
    title: 'ЛАЙФХАКИ',
    description: 'Профессиональные секреты, которые сэкономят вам часы уборки'
  }
];

// Создаём зацикленный массив: клоны в начале и в конце
const createInfiniteSlides = () => {
  const cloneCount = 3;
  const beforeClones = slides.slice(-cloneCount).map((s, i) => ({ ...s, id: `before-${i}` }));
  const afterClones = slides.slice(0, cloneCount).map((s, i) => ({ ...s, id: `after-${i}` }));
  return [...beforeClones, ...slides, ...afterClones];
};

const infiniteSlides = createInfiniteSlides();
const CLONE_COUNT = 3;
const CARD_WIDTH = 260;
const GAP = 16;
const CARD_TOTAL = CARD_WIDTH + GAP;

function BubbleCard({ icon, title, description, isHorizontal }) {
  const [isHovered, setIsHovered] = useState(false);
  const width = isHorizontal ? '260px' : '280px';
  const padding = isHorizontal ? '20px 18px 24px' : '22px 20px 26px';
  const iconSize = isHorizontal ? '48px' : '52px';
  const titleSize = isHorizontal ? '15px' : '16px';
  const descSize = isHorizontal ? '12px' : '13px';
  
  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        flexShrink: 0,
        width,
        borderRadius: '24px',
        backgroundColor: '#ffffff',
        boxShadow: '0 20px 60px rgba(213, 216, 232, 1)',
        padding,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif',
        WebkitFontSmoothing: 'antialiased',
        scrollSnapAlign: isHorizontal ? 'center' : 'none',
        scrollSnapStop: isHorizontal ? 'always' : 'normal',
        border: isHovered ? '1px solid #d9d9d9' : '1px solid transparent',
        transition: 'border-color 0.2s ease',
        cursor: 'pointer'
      }}
    >
      {/* Эмодзи */}
      <div 
        style={{ 
          fontSize: iconSize,
          lineHeight: 1,
          marginBottom: isHorizontal ? '12px' : '14px'
        }}
      >
        {icon}
      </div>
      
      {/* Заголовок */}
      <h3 
        style={{ 
          fontSize: titleSize,
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: '#202124',
          margin: `0 0 ${isHorizontal ? '8px' : '10px'}`,
          lineHeight: 1.2
        }}
      >
        {title}
      </h3>
      
      {/* Описание */}
      <p 
        style={{ 
          fontSize: descSize,
          lineHeight: isHorizontal ? 1.65 : 1.7,
          letterSpacing: '0.01em',
          color: '#6b7280',
          margin: 0,
          textTransform: 'uppercase'
        }}
      >
        {description}
      </p>
      
      {/* Хвостик пузыря */}
      <svg 
        style={{ 
          position: 'absolute',
          bottom: '-13px', 
          right: isHorizontal ? '16px' : '18px'
        }}
        width="60" 
        height="13" 
        viewBox="0 0 60 13"
      >
        <path 
          d="M0 0 C20 0 20 13 30 13 C40 13 40 0 60 0 Z"
          fill="#ffffff"
        />
      </svg>
    </div>
  );
}

function VersionToggle({ isHorizontal, onToggle }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        padding: '4px',
        borderRadius: '100px',
        backgroundColor: '#ffffff',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif',
        zIndex: 100
      }}
    >
      <button
        onClick={() => onToggle(false)}
        style={{
          padding: '8px 16px',
          borderRadius: '100px',
          border: 'none',
          fontSize: '13px',
          fontWeight: 600,
          letterSpacing: '0.02em',
          cursor: 'pointer',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          backgroundColor: !isHorizontal ? '#202124' : 'transparent',
          color: !isHorizontal ? '#ffffff' : '#6b7280'
        }}
      >
        Вертикальная
      </button>
      <button
        onClick={() => onToggle(true)}
        style={{
          padding: '8px 16px',
          borderRadius: '100px',
          border: 'none',
          fontSize: '13px',
          fontWeight: 600,
          letterSpacing: '0.02em',
          cursor: 'pointer',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          backgroundColor: isHorizontal ? '#202124' : 'transparent',
          color: isHorizontal ? '#ffffff' : '#6b7280'
        }}
      >
        Горизонтальная
      </button>
    </div>
  );
}

function Dots({ currentIndex, total, onGoToSlide, isHorizontal }) {
  return (
    <div 
      style={{ 
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginTop: isHorizontal ? '-40px' : '8px'
      }}
    >
      {Array.from({ length: total }).map((_, index) => (
        <button
          key={index}
          onClick={() => onGoToSlide(index)}
          style={{
            width: currentIndex === index ? '20px' : '6px',
            height: '6px',
            borderRadius: '100px',
            backgroundColor: currentIndex === index ? '#202124' : '#d1d1d6',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        />
      ))}
    </div>
  );
}

export default function Carousel() {
  const [isHorizontal, setIsHorizontal] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(2);
  const scrollRef = useRef(null);
  const isScrollingRef = useRef(false);
  
  // Инициализация позиции для горизонтальной версии
  useEffect(() => {
    if (isHorizontal && scrollRef.current) {
      const initialScroll = (CLONE_COUNT + currentIndex) * CARD_TOTAL;
      scrollRef.current.scrollLeft = initialScroll;
    }
  }, [isHorizontal]);

  const handleScroll = () => {
    if (!scrollRef.current || !isHorizontal || isScrollingRef.current) return;
    
    const scrollLeft = scrollRef.current.scrollLeft;
    const totalOriginal = slides.length;
    
    // Вычисляем индекс с учётом клонов
    const rawIndex = Math.round(scrollLeft / CARD_TOTAL);
    const adjustedIndex = rawIndex - CLONE_COUNT;
    
    // Определяем реальный индекс (0 to totalOriginal-1)
    let realIndex = ((adjustedIndex % totalOriginal) + totalOriginal) % totalOriginal;
    
    if (realIndex !== currentIndex) {
      setCurrentIndex(realIndex);
    }
    
    // Бесконечная прокрутка: телепортация при достижении клонов
    const minScroll = CARD_TOTAL * 1;
    const maxScroll = CARD_TOTAL * (CLONE_COUNT + totalOriginal + 1);
    
    if (scrollLeft <= minScroll) {
      isScrollingRef.current = true;
      scrollRef.current.scrollLeft = scrollLeft + (totalOriginal * CARD_TOTAL);
      setTimeout(() => { isScrollingRef.current = false; }, 50);
    } else if (scrollLeft >= maxScroll) {
      isScrollingRef.current = true;
      scrollRef.current.scrollLeft = scrollLeft - (totalOriginal * CARD_TOTAL);
      setTimeout(() => { isScrollingRef.current = false; }, 50);
    }
  };

  const goToSlide = (index) => {
    setCurrentIndex(index);
    if (isHorizontal && scrollRef.current) {
      const targetScroll = (CLONE_COUNT + index) * CARD_TOTAL;
      scrollRef.current.scrollTo({
        left: targetScroll,
        behavior: 'smooth'
      });
    }
  };

  const visibleSlides = isHorizontal 
    ? infiniteSlides 
    : [slides[currentIndex], slides[(currentIndex + 1) % slides.length]];

  return (
    <div 
      style={{ 
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
        overflow: 'hidden',
        paddingTop: '80px'
      }}
    >
      <VersionToggle 
        isHorizontal={isHorizontal} 
        onToggle={setIsHorizontal} 
      />

      {isHorizontal ? (
        /* Горизонтальная версия */
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          style={{ 
            display: 'flex',
            gap: `${GAP}px`,
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            width: '100%',
            paddingTop: '32px',
            paddingBottom: '80px',
            paddingLeft: `calc((100% - ${CARD_WIDTH}px) / 2)`,
            paddingRight: `calc((100% - ${CARD_WIDTH}px) / 2)`
          }}
        >
          {visibleSlides.map((slide) => (
            <BubbleCard
              key={slide.id}
              icon={slide.icon}
              title={slide.title}
              description={slide.description}
              isHorizontal={true}
            />
          ))}
        </div>
      ) : (
        /* Вертикальная версия */
        <div 
          style={{ 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            paddingTop: '32px',
            paddingBottom: '32px'
          }}
        >
          {visibleSlides.map((slide) => (
            <BubbleCard
              key={slide.id}
              icon={slide.icon}
              title={slide.title}
              description={slide.description}
              isHorizontal={false}
            />
          ))}
        </div>
      )}
      
      <Dots 
        currentIndex={currentIndex} 
        total={slides.length} 
        onGoToSlide={goToSlide}
        isHorizontal={isHorizontal}
      />

      <style>{`
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
