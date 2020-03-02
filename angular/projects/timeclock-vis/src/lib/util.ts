export function inFieldOfView([start, end], [fromDate, toDate]): boolean {
  return (start > fromDate && start < toDate) ? true :
    (end == null) ? true :
    (end > fromDate && end < toDate) ? true :
    (start < fromDate && end > toDate) ? true :
    false;
}
