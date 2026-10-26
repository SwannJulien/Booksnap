const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A LocalDate (`2023-10-12`) or ISO datetime string to a local `Date`.
 * Built field by field on purpose: `new Date('2023-10-12')` parses as UTC and shifts
 * the day for anyone west of Greenwich.
 */
export function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** `2023-10-12` -> `Oct 12, 2023` */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  return parseDate(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

/** Whole days between a past due date and today, floored at 1 ("Late (1 days)"). */
export function daysLate(endDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((today - parseDate(endDateStr)) / MS_PER_DAY));
}

function parseDateTime(dateTimeStr) {
  const [datePart, timePart = ''] = dateTimeStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours = 0, minutes = 0] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

/** `2024-04-02T11:30:00` -> `Apr 2, 2024, 11:30` */
export function formatDateTime(dateTimeStr) {
  if (!dateTimeStr) return '';
  return parseDateTime(dateTimeStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

/** `2023-01-09T12:00:00` -> `Jan 9, 2023` */
export function formatDay(dateTimeStr) {
  if (!dateTimeStr) return '';
  return parseDate(dateTimeStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
