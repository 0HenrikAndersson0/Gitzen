import { useEffect, useState } from 'react';

interface SplashScreenProps {
  visible: boolean;
  onHidden?: () => void;
}

export function SplashScreen({ visible, onHidden }: SplashScreenProps) {
  const [shouldRender, setShouldRender] = useState(true);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    if (!visible) {
      setOpacity(0);
      const timer = setTimeout(() => {
        setShouldRender(false);
        onHidden?.();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [visible, onHidden]);

  if (!shouldRender) return null;

  return (
    <div 
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background transition-opacity duration-500"
      style={{ opacity }}
    >
      <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
        <h1 className="text-4xl font-bold text-foreground tracking-tight mb-2">Gitzen</h1>
        <p className="text-muted-foreground text-sm">Loading your workspace...</p>
        
        <div className="mt-8 w-48 h-1 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 animate-loading-bar rounded-full"></div>
        </div>
      </div>
    </div>
  );
}
