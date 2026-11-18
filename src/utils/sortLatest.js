/**
 * Resolves the newest available timestamp (in ms) for a record across common date columns.
 */
function getRecordTimestamp(row) {
  if (!row || typeof row !== 'object') return 0;
  const dateKeys = [
    'created_at',
    'paid_at',
    'timestamp',
    'updated_at',
    'payment_date',
    'order_date',
    'reviewed_at',
    'completed_at',
    'scheduled_date',
    'preferred_date',
    'start_date'
  ];
  for (const key of dateKeys) {
    const raw = row[key];
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (!Number.isNaN(ms) && ms > 0) return ms;
  }
  return 0;
}

/**
 * Sorts an array newest-first by timestamp descending, breaking ties (or ordering undated rows)
 * by descending numeric ID across one or more candidate ID fields.
 */
function sortByLatest(items, idFields = []) {
  if (!Array.isArray(items)) return [];
  const fields = Array.isArray(idFields) ? idFields : [idFields];
  return [...items].sort((a, b) => {
    const timeB = getRecordTimestamp(b);
    const timeA = getRecordTimestamp(a);
    if (timeB !== timeA) return timeB - timeA;
    for (const field of fields) {
      if (!field) continue;
      const numB = Number(b?.[field] || 0);
      const numA = Number(a?.[field] || 0);
      if (!Number.isNaN(numB) && !Number.isNaN(numA) && numB !== numA) {
        return numB - numA;
      }
    }
    return 0;
  });
}

module.exports = {
  getRecordTimestamp,
  sortByLatest
};
