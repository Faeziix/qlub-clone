import { bigintToNumber } from "./money";

type WithBigintMoney<T extends object> = T & {
  amount?: bigint;
  tipAmount?: bigint;
  total?: bigint;
  unitPrice?: bigint;
  lineTotal?: bigint;
  subtotal?: bigint;
  serviceCharge?: bigint;
  tax?: bigint;
  discount?: bigint;
  amountPaid?: bigint;
};

type OrderItemRaw = {
  id: string;
  orderId: string;
  itemId: string | null;
  name: string;
  unitPrice: bigint;
  quantity: number;
  modifiers: unknown;
  notes: string | null;
  lineTotal: bigint;
  [key: string]: unknown;
};

type OrderRaw = {
  id: string;
  orderNumber: string;
  vendorId: string;
  tableId: string | null;
  type: string;
  status: string;
  guestName: string | null;
  guestPhone: string | null;
  notes: string | null;
  currency: string;
  subtotal: bigint;
  serviceCharge: bigint;
  tax: bigint;
  discount: bigint;
  tipAmount: bigint;
  total: bigint;
  amountPaid: bigint;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemRaw[];
  vendor: { [key: string]: unknown };
  table: { [key: string]: unknown } | null;
  [key: string]: unknown;
};

type PaymentRaw = {
  id: string;
  orderId: string;
  vendorId: string;
  amount: bigint;
  tipAmount: bigint;
  total: bigint;
  currency: string;
  method: string;
  status: string;
  reference: string;
  createdAt: Date;
  [key: string]: unknown;
};

export function serializeOrder(order: OrderRaw) {
  return {
    ...order,
    subtotal: bigintToNumber(order.subtotal),
    serviceCharge: bigintToNumber(order.serviceCharge),
    tax: bigintToNumber(order.tax),
    discount: bigintToNumber(order.discount),
    tipAmount: bigintToNumber(order.tipAmount),
    total: bigintToNumber(order.total),
    amountPaid: bigintToNumber(order.amountPaid),
    items: order.items.map((item) => ({
      ...item,
      unitPrice: bigintToNumber(item.unitPrice),
      lineTotal: bigintToNumber(item.lineTotal),
    })),
  };
}

export function serializePayment(payment: PaymentRaw) {
  return {
    ...payment,
    amount: bigintToNumber(payment.amount),
    tipAmount: bigintToNumber(payment.tipAmount),
    total: bigintToNumber(payment.total),
  };
}

export function serializePaymentResult(result: {
  payment: PaymentRaw;
  fullyPaid: boolean;
  amountPaid: bigint;
}) {
  return {
    ...result,
    amountPaid: bigintToNumber(result.amountPaid),
    payment: serializePayment(result.payment),
  };
}

export type { WithBigintMoney };
