import { useState, useEffect } from 'react';

export const useChartTheme = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');

    return () => observer.disconnect();
  }, []);

  return {
    textColor: theme === 'dark' ? '#94A3B8' : '#64748B',
    gridColor: theme === 'dark' ? '#1E293B' : '#F1F5F9',
    tooltipBg: theme === 'dark' ? '#1E293B' : '#FFFFFF',
    tooltipBorder: theme === 'dark' ? '#334155' : '#E2E8F0',
    tooltipText: theme === 'dark' ? '#F8FAFC' : '#0F172A',
    axisStroke: theme === 'dark' ? '#334155' : '#E2E8F0',
  };
};
export default useChartTheme;
