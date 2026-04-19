import React, { createContext, useCallback, useContext, useState } from "react";

export interface ReceiptData {
  squarePaymentId: string;
  amountCents: number;
  description: string | null;
  invoiceNumber: string | null;
  clientName: string | null;
  paidAt: Date;
}

interface PaymentSession {
  amountCents: number;
  description: string;
  invoiceId: number | null;
  invoiceNumber: string | null;
  clientName: string | null;
  squarePaymentId: string | null;
  receipt: ReceiptData | null;
}

const DEFAULT_SESSION: PaymentSession = {
  amountCents: 0,
  description: "",
  invoiceId: null,
  invoiceNumber: null,
  clientName: null,
  squarePaymentId: null,
  receipt: null,
};

interface PaymentSessionContextType {
  session: PaymentSession;
  setPaymentDetails: (details: Partial<PaymentSession>) => void;
  clearSession: () => void;
}

const PaymentSessionContext = createContext<PaymentSessionContextType | null>(null);

export function PaymentSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<PaymentSession>(DEFAULT_SESSION);

  const setPaymentDetails = useCallback((details: Partial<PaymentSession>) => {
    setSession((prev) => ({ ...prev, ...details }));
  }, []);

  const clearSession = useCallback(() => {
    setSession(DEFAULT_SESSION);
  }, []);

  return (
    <PaymentSessionContext.Provider value={{ session, setPaymentDetails, clearSession }}>
      {children}
    </PaymentSessionContext.Provider>
  );
}

export function usePaymentSession(): PaymentSessionContextType {
  const ctx = useContext(PaymentSessionContext);
  if (!ctx) throw new Error("usePaymentSession must be used within PaymentSessionProvider");
  return ctx;
}
