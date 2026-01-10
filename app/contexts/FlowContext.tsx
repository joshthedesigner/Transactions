'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface FlowContextType {
  isFlowOpen: boolean;
  openFlow: () => void;
  closeFlow: () => void;
}

const FlowContext = createContext<FlowContextType | undefined>(undefined);

export function FlowProvider({ children }: { children: ReactNode }) {
  const [isFlowOpen, setIsFlowOpen] = useState(false);

  const openFlow = () => setIsFlowOpen(true);
  const closeFlow = () => setIsFlowOpen(false);

  return (
    <FlowContext.Provider value={{ isFlowOpen, openFlow, closeFlow }}>
      {children}
    </FlowContext.Provider>
  );
}

export function useFlow() {
  const context = useContext(FlowContext);
  if (context === undefined) {
    throw new Error('useFlow must be used within a FlowProvider');
  }
  return context;
}




