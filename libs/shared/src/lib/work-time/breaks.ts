export interface TimeSummary {
  grossMinutes: number;
  breakMinutes: number;
  netMinutes: number;
}

export function calculateBreakMinutes(grossMinutes: number): number {
  if (grossMinutes >= 9 * 60) return 45;
  if (grossMinutes >= 6 * 60) return 30;
  return 0;
}

export function calculateNetMinutes(grossMinutes: number): number {
  if (grossMinutes <= 0) return 0;
  return Math.max(0, grossMinutes - calculateBreakMinutes(grossMinutes));
}

export function summarize(clockIn: Date, clockOut: Date | null | undefined): TimeSummary {
  if (!clockOut || clockOut.getTime() <= clockIn.getTime()) {
    return { grossMinutes: 0, breakMinutes: 0, netMinutes: 0 };
  }
  const grossMinutes = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60_000);
  const breakMinutes = calculateBreakMinutes(grossMinutes);
  return { grossMinutes, breakMinutes, netMinutes: grossMinutes - breakMinutes };
}
