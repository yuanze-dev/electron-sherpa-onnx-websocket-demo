/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    getWindowOpacity: () => Promise<number>;
    setWindowOpacity: (value: number) => Promise<number>;
  };
}
