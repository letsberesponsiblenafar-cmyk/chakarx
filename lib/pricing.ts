export type PricingInputs = {
  accommodation: number;
  vehicleDays: number;
  transportDaily: number;
  other: number;
  profitPct: number;
};

// The planner estimate, operator costing and customer PDF all use this calculation.
export function priceTrip(input: PricingInputs) {
  const accommodation = Math.max(0, input.accommodation);
  const vehicleDays = Math.max(0, input.vehicleDays);
  const transport = vehicleDays * Math.max(0, input.transportDaily);
  const other = Math.max(0, input.other);
  const b2bCost = accommodation + transport + other;
  const profit = b2bCost * (Math.max(0, Math.min(100, input.profitPct)) / 100);
  const subtotalAfterMarkup = b2bCost + profit;
  const gst = subtotalAfterMarkup * 0.05;
  const sellingTotal = subtotalAfterMarkup + gst;
  return { accommodation, vehicleDays, transport, other, b2bCost, profit, subtotalAfterMarkup, gst, sellingTotal, low: b2bCost * 0.95, high: b2bCost * 1.08 };
}

export function paymentAmounts(total: number, bookingPct: number, arrivalPct: number) {
  const booking = Math.round(total * bookingPct / 100);
  const arrival = Math.round(total * arrivalPct / 100);
  const during = Math.round(total) - booking - arrival;
  return { booking, arrival, during, duringPct: 100 - bookingPct - arrivalPct };
}
