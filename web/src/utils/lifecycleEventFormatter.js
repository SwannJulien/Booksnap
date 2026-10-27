import { formatDateTime, formatDay } from './dateFormatter.js';
import { formatStatus } from './statusFormatter.js';

const studentName = ({ student }) => `${student.firstName} ${student.lastName}`;

// Keys are listed in jsonb order, which is the order the server stored them in: no sort.
const changedFields = ({ detail }) =>
  Object.keys(detail.changes ?? {}).join(', ');

const EVENT_LABELS = {
  book_created: event => `Book created as "${event.detail.title}"`,
  book_updated: event => `Book updated: ${changedFields(event)}`,
  book_deleted: () => 'Book deleted',
  copy_created: () => 'Copy created',
  copy_updated: event => `Copy updated: ${changedFields(event)}`,
  copy_status_changed: ({ detail }) =>
    `Status: ${formatStatus(detail.from)} → ${formatStatus(detail.to)}`,
  copy_deleted: () => 'Copy deleted',
  borrowed: event => `Borrowed by ${studentName(event)}`,
  overdue: event => `Overdue: ${studentName(event)}`,
  returned: event => `Returned by ${studentName(event)}`,
  hold_placed: event => `Hold placed by ${studentName(event)}`,
  hold_promoted: event => `Set aside for ${studentName(event)}`,
  hold_expired: event => `Hold expired: ${studentName(event)}`,
  hold_fulfilled: event => `Hold collected by ${studentName(event)}`,
};

export function formatEventLabel(event) {
  return EVENT_LABELS[event.type]?.(event) ?? event.type;
}

export function formatEventDate(event) {
  return event.approximateDate
    ? `${formatDay(event.occurredAt)} (approx.)`
    : formatDateTime(event.occurredAt);
}
