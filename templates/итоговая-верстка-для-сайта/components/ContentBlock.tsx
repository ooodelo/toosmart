import React from 'react';
import { ThemeStyles } from '../types';
import { Lightbulb, Info, AlertTriangle } from 'lucide-react';

interface ContentBlockProps {
  theme: ThemeStyles;
  markerClassName: string;
}

const ContentBlock: React.FC<ContentBlockProps> = ({ theme, markerClassName }) => {
  const markerStyle = { '--marker-color': theme.markerColor } as React.CSSProperties;

  return (
    <div className={theme.fontFamily}>
      
      {/* Article Header */}
      <h1 className={theme.h1}>
        Когнитивные искажения: почему наш мозг нас обманывает?
      </h1>
      
      <p className={theme.p}>
        Каждый день мы принимаем тысячи решений. Что надеть, какой дорогой пойти на работу, стоит ли доверять новому знакомому. Нам кажется, что мы мыслим рационально, взвешиваем «за» и «против», но на самом деле <span className={theme.bold}>наш мозг — это ленивый программист</span>, который написал кучу скриптов для экономии энергии. Эти скрипты называются когнитивными искажениями.
      </p>

      {/* Info Callout */}
      <div className={theme.calloutInfo}>
        <div className="shrink-0 pt-1">
          <Info className="w-6 h-6 opacity-70" />
        </div>
        <div>
          <h4 className="font-bold opacity-90 mb-1 block">Справка</h4>
          <span className="opacity-80">
             Когнитивное искажение — это систематическая ошибка мышления, возникающая на основе дисфункциональных убеждений, внедрённых в когнитивные схемы.
          </span>
        </div>
      </div>

      <h2 className={theme.h2}>Ошибка выжившего</h2>
      
      <p className={theme.p}>
        Во время Второй мировой войны математик Абрахам Вальд получил задание: понять, где нужно укрепить броню бомбардировщиков. Военные принесли ему схемы самолетов, вернувшихся с боя. Все они были испещрены пробоинами на крыльях и фюзеляже.
      </p>

      <blockquote className={theme.blockquote}>
        «Где пробоин нет — там и нужно укреплять. Потому что получившие попадания в эти места самолеты просто не вернулись».
      </blockquote>

      <p className={theme.p}>
        Это классический пример <span className={markerClassName} style={markerStyle}>ошибки выжившего</span>. Мы склонны делать выводы на основе данных, которые у нас есть (выжившие), игнорируя данные, которые были утеряны (погибшие). В жизни это работает так же: мы читаем биографии успешных бизнесменов и думаем, что если будем делать то же самое, тоже станем миллионерами. Мы не видим тысячи тех, кто делал то же самое, но прогорел.
      </p>

      <h2 className={theme.h2}>Эффект привязки (Якорение)</h2>

      <p className={theme.p}>
        Представьте, что вы заходите в магазин дорогой одежды. Вы видите куртку за <span className={theme.bold}>50 000 рублей</span>. Ужасно дорого! Рядом висит другая, за 15 000 рублей. По сравнению с первой она кажется вполне доступной, хотя в другом магазине цена в 15 000 показалась бы вам завышенной.
      </p>

      <div className={theme.calloutIdea}>
        <div className="shrink-0 pt-1">
          <Lightbulb className="w-6 h-6 opacity-70" />
        </div>
         <div>
          <h4 className="font-bold opacity-90 mb-1 block">Идея</h4>
          <span className="opacity-80">
            Маркетологи используют «якоря» постоянно. Зачеркнутая старая цена — это якорь. Вы оцениваете выгоду не объективно, а относительно первого числа, которое увидели.
          </span>
        </div>
      </div>

      <h3 className={theme.h3}>Как с этим бороться?</h3>

      <ul className={theme.list}>
        <li className={theme.listItem}>
          <span className={theme.bold}>Ищите альтернативы.</span> Не сравнивайте цену только с аналогами в этом же магазине.
        </li>
        <li className={theme.listItem}>
          <span className={theme.bold}>Задавайте базовые вопросы.</span> Нужна ли мне эта вещь вообще, независимо от скидки?
        </li>
        <li className={theme.listItem}>
          <span className={theme.bold}>Пауза.</span> Дайте себе время «остыть» от первого впечатления.
        </li>
      </ul>

      <hr className={theme.hr} />

      <h2 className={theme.h2}>Фундаментальная ошибка атрибуции</h2>

      <p className={theme.p}>
        Если кто-то подрезал вас на дороге, вы думаете: <span className={theme.italic}>«Какой мудак!»</span>. Если вы подрезали кого-то, вы думаете: <span className={theme.italic}>«Я просто тороплюсь, у меня важная встреча»</span>.
      </p>
      
      <p className={theme.p}>
        Мы склонны объяснять поступки других людей их <span className={markerClassName} style={markerStyle}>личностными качествами</span> (он злой, он глупый), а свои собственные — <span className={markerClassName} style={markerStyle}>внешними обстоятельствами</span> (была пробка, будильник не прозвенел).
      </p>

      <div className={theme.calloutWarning}>
        <div className="shrink-0 pt-1">
          <AlertTriangle className="w-6 h-6 opacity-70" />
        </div>
         <div>
          <h4 className="font-bold opacity-90 mb-1 block">Важно!</h4>
          <span className="opacity-80">
            Понимание этого искажения — ключ к эмпатии. В следующий раз, когда коллега ошибется, попробуйте подумать не о том, что он некомпетентен, а о том, какие обстоятельства могли этому способствовать.
          </span>
        </div>
      </div>

      <h3 className={theme.h3}>Заключение</h3>
      <p className={theme.p}>
        Мозг не идеален. Но знание своих багов — это первый шаг к их исправлению. Читайте больше на <span className={theme.link}>Википедии</span> или в книгах Канемана.
      </p>
    </div>
  );
};

export default ContentBlock;