"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { dirFor } from "@/lib/i18n";
import { ReceiptDisplay } from "./ReceiptDisplay";
import { ReviewForm } from "./ReviewForm";
import { ThankYouScreen } from "./ThankYouScreen";

type SuccessStep = "receipt" | "review" | "done";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  lineTotal: number;
}

interface PaymentSuccessClientProps {
  lang: string;
  orderNumber: string;
  total: number;
  subtotal: number;
  tipAmount: number;
  serviceCharge: number;
  tax: number;
  items: OrderItem[];
  vendorName: string;
  vendorSlug: string;
  country: string;
  paymentId: string | null;
  tippingEnabled: boolean;
  isSplitPayment: boolean;
  splitPaymentAmount: number;
  splitPaymentTipAmount: number;
}

export function PaymentSuccessClient({
  lang,
  orderNumber,
  total,
  subtotal,
  tipAmount,
  serviceCharge,
  tax,
  items,
  vendorName,
  vendorSlug,
  country,
  paymentId,
  tippingEnabled,
  isSplitPayment,
  splitPaymentAmount,
  splitPaymentTipAmount,
}: PaymentSuccessClientProps) {
  const dir = dirFor(lang);
  const router = useRouter();
  const [step, setStep] = React.useState<SuccessStep>("receipt");

  const menuUrl = `/${lang === "fa" ? "" : `${lang}/`}qr/${country}/${vendorSlug}`;

  if (step === "review" && paymentId) {
    return (
      <ReviewForm
        lang={lang}
        dir={dir}
        vendorSlug={vendorSlug}
        vendorName={vendorName}
        paymentId={paymentId}
        onDone={() => setStep("done")}
        onBack={() => setStep("receipt")}
      />
    );
  }

  if (step === "done") {
    return (
      <ThankYouScreen
        lang={lang}
        dir={dir}
        vendorName={vendorName}
        onBackToMenu={() => router.push(menuUrl)}
      />
    );
  }

  return (
    <ReceiptDisplay
      lang={lang}
      dir={dir}
      orderNumber={orderNumber}
      total={total}
      subtotal={subtotal}
      tipAmount={tipAmount}
      serviceCharge={serviceCharge}
      tax={tax}
      items={items}
      vendorName={vendorName}
      paymentId={paymentId}
      tippingEnabled={tippingEnabled}
      isSplitPayment={isSplitPayment}
      splitPaymentAmount={splitPaymentAmount}
      splitPaymentTipAmount={splitPaymentTipAmount}
      onRateExperience={() => setStep("review")}
      onBackToMenu={() => router.push(menuUrl)}
    />
  );
}
