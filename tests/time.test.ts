import { describe, expect, it } from 'vitest';
import {
  addMinutes,
  formatDuration,
  formatHHMM,
  formatWindow,
  parseHHMM,
  to12h,
} from '@/lib/time';

describe('parseHHMM / formatHHMM', () => {
  it('round-trips zero-padded times', () => {
    for (const t of ['00:00', '08:00', '09:05', '12:30', '23:59']) {
      expect(formatHHMM(parseHHMM(t))).toBe(t);
    }
  });

  it('parses single-digit hours and trims whitespace', () => {
    expect(parseHHMM('8:00')).toBe(480);
    expect(parseHHMM(' 13:45 ')).toBe(825);
  });

  it('formats minutes since midnight, rounding and wrapping past midnight', () => {
    expect(formatHHMM(0)).toBe('00:00');
    expect(formatHHMM(485.4)).toBe('08:05');
    expect(formatHHMM(485.6)).toBe('08:06');
    expect(formatHHMM(1440)).toBe('00:00');
    expect(formatHHMM(1500)).toBe('01:00');
    expect(formatHHMM(-30)).toBe('23:30');
  });

  it('throws on malformed input', () => {
    for (const bad of ['', 'abc', '25:00', '12:60', '12', '12:5', '1200', '-1:00']) {
      expect(() => parseHHMM(bad), bad).toThrow();
    }
  });
});

describe('addMinutes', () => {
  it('adds minutes and carries into the next hour / day', () => {
    expect(addMinutes('08:00', 30)).toBe('08:30');
    expect(addMinutes('08:45', 30)).toBe('09:15');
    expect(addMinutes('23:30', 60)).toBe('00:30');
    expect(addMinutes('09:00', -15)).toBe('08:45');
  });

  it('throws when the base time is invalid', () => {
    expect(() => addMinutes('nope', 5)).toThrow();
  });
});

describe('formatDuration', () => {
  it('formats hours and minutes compactly', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(75)).toBe('1h 15m');
    expect(formatDuration(135.6)).toBe('2h 16m');
  });

  it('never goes negative', () => {
    expect(formatDuration(-10)).toBe('0m');
  });
});

describe('to12h / formatWindow', () => {
  it('converts 24h to 12h', () => {
    expect(to12h('00:05')).toBe('12:05 AM');
    expect(to12h('09:00')).toBe('9:00 AM');
    expect(to12h('12:00')).toBe('12:00 PM');
    expect(to12h('13:30')).toBe('1:30 PM');
  });

  it('collapses the suffix when both ends share it', () => {
    expect(formatWindow({ start: '09:00', end: '11:00' })).toBe('9:00–11:00 AM');
    expect(formatWindow({ start: '13:00', end: '15:00' })).toBe('1:00–3:00 PM');
  });

  it('keeps both suffixes when the window crosses noon', () => {
    expect(formatWindow({ start: '10:00', end: '14:00' })).toBe('10:00 AM–2:00 PM');
  });

  it('throws on bad input', () => {
    expect(() => to12h('99:99')).toThrow();
    expect(() => formatWindow({ start: '9', end: '10:00' })).toThrow();
  });
});
