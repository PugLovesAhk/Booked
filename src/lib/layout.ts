import { useEffect, useState } from 'react';

export type Layout = 'phone' | 'tablet' | 'desktop';

// Computer = wide screen with a mouse. A touch tablet in landscape stays "tablet".
const DESKTOP = '(min-width: 1024px) and (pointer: fine)';
const TABLET = '(min-width: 700px)';

function current(): Layout {
  if (window.matchMedia(DESKTOP).matches) return 'desktop';
  if (window.matchMedia(TABLET).matches) return 'tablet';
  return 'phone';
}

export function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>(current);
  useEffect(() => {
    const update = () => setLayout(current());
    const queries = [DESKTOP, TABLET].map((q) => window.matchMedia(q));
    queries.forEach((q) => q.addEventListener('change', update));
    window.addEventListener('resize', update);
    return () => {
      queries.forEach((q) => q.removeEventListener('change', update));
      window.removeEventListener('resize', update);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.layout = layout;
  }, [layout]);
  return layout;
}
