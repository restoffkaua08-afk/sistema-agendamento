export type WorkingHours = { staffId?: string; weekday: number; startsAt: string; endsAt: string };
export type AvailabilityBlock = { startsAt: Date; endsAt: Date };
export type AvailabilityAppointment = { startsAt: Date; endsAt: Date; status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show" };
export type AvailabilityInput = { date: Date; weekday: number; timeZone?: string; durationMinutes: number; bufferMinutes: number; intervalMinutes: number; schedules: WorkingHours[]; blocks: AvailabilityBlock[]; appointments: AvailabilityAppointment[] };

const minutes = (value: string) => { const [hours, mins] = value.split(":").map(Number); return hours * 60 + mins; };
const atMinutes = (date: Date, value: number) => { const result = new Date(date); result.setHours(Math.floor(value / 60), value % 60, 0, 0); return result; };
const overlaps = (start: Date, end: Date, otherStart: Date, otherEnd: Date) => start < otherEnd && end > otherStart;

export function localDateTimeToInstant(date: string, time: string, timeZone: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return null;
  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;
  const wallTime = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const wallDate = new Date(wallTime);
  if (wallDate.toISOString().slice(0, 10) !== date || Number(hour) > 23 || Number(minute) > 59) return null;
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    const partsAt = (instant: number) => Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const offsets = new Set<number>();
    for (let hours = -36; hours <= 36; hours += 6) {
      const sample = wallTime + hours * 60 * 60_000;
      const parts = partsAt(sample);
      const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
      offsets.add(localAsUtc - sample);
    }
    const matches = [...offsets].map((offset) => wallTime - offset).filter((instant) => {
      const parts = partsAt(instant);
      return parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute;
    });
    return matches.length ? new Date(Math.min(...matches)) : null;
  } catch { return null; }
}

export function calculateAvailability(input: AvailabilityInput): Date[] {
  const schedule = input.schedules.find((item) => item.weekday === input.weekday);
  if (!schedule) return [];
  const dayStart = minutes(schedule.startsAt); const dayEnd = minutes(schedule.endsAt); const step = Math.max(5, input.intervalMinutes); const result: Date[] = [];
  for (let startMinute = dayStart; startMinute + input.durationMinutes + input.bufferMinutes <= dayEnd; startMinute += step) {
    const localTime = `${String(Math.floor(startMinute / 60)).padStart(2, "0")}:${String(startMinute % 60).padStart(2, "0")}`;
    const localDate = `${input.date.getFullYear()}-${String(input.date.getMonth() + 1).padStart(2, "0")}-${String(input.date.getDate()).padStart(2, "0")}`;
    const startsAt = input.timeZone ? localDateTimeToInstant(localDate, localTime, input.timeZone) : atMinutes(input.date, startMinute);
    if (!startsAt) continue;
    const endsAt = new Date(startsAt.getTime() + (input.durationMinutes + input.bufferMinutes) * 60_000);
    const blocked = input.blocks.some((item) => overlaps(startsAt, endsAt, item.startsAt, item.endsAt));
    const booked = input.appointments.filter((item) => item.status !== "cancelled" && item.status !== "no_show").some((item) => overlaps(startsAt, endsAt, item.startsAt, item.endsAt));
    if (!blocked && !booked) result.push(startsAt);
  }
  return result;
}
