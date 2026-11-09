export const STANDARD_START_MINUTES = 7 * 60;
export const STANDARD_END_MINUTES = 18 * 60;

export const TIME_SLOTS = Array.from({ length: 48 }, (_, index) => {
  const minutes = index * 30;
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const rest = String(minutes % 60).padStart(2, "0");

  return { minutes, label: `${hours}:${rest}` };
});

export const STANDARD_TIME_SLOTS = TIME_SLOTS.filter(
  (slot) =>
    slot.minutes >= STANDARD_START_MINUTES &&
    slot.minutes < STANDARD_END_MINUTES,
);
