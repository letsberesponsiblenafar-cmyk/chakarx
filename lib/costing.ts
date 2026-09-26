import type { Plan } from '@/lib/itinerary';
import type { CostModel, HotelSelection } from '@/components/PlannerProvider';

export function calculateCosts(plan: Plan, hotels: HotelSelection[], model: CostModel) {
  const accommodation = hotels.reduce((sum, h) => {
    return sum + h.nights * h.rooms * h.nightlyRate + h.nights * h.extraBeds * h.extraBedRate + h.nights * h.cnb * h.cnbRate;
  }, 0);
  const vehicleDays = plan.dayPlans.reduce((sum, d) => sum + Math.max(0, d.drive.vehicleDaysCharged), 0);
  const transport = vehicleDays * model.transportDaily;
  // Meal-plan choice remains part of the client brief, but meal pricing is intentionally
  // not added to Others. Operators enter only genuine additional package costs there.
  const meals = 0;
  const activities = 0;
  const other = Math.max(0, model.otherAmount);
  const preMarkup = accommodation + transport + other;
  const low = preMarkup * 0.95;
  const high = preMarkup * 1.08;
  const profit = preMarkup * (model.profitPct / 100);
  const subtotalAfterMarkup = preMarkup + profit;
  // GST is applied after profit/markup, as requested.
  const gst = subtotalAfterMarkup * 0.05;
  const b2bCost = preMarkup;
  const sellingTotal = subtotalAfterMarkup + gst;
  const people = plan.input.adults + plan.input.youngAges.length;
  const missingHotelRates = hotels.filter((h) => !h.hotelName || h.hotelName === 'Hotel to be added' || h.nightlyRate <= 0).map((h) => h.location);
  return { accommodation, transport, meals, activities, other, gst, vehicleDays, preGst: preMarkup, b2bCost, profit, subtotalAfterMarkup, sellingTotal, low, high, people, missingHotelRates };
}
