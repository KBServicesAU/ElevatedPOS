let counter = 1;
export function generateOrderNumber(locationCode = 'ORD'): string {
  const date = new Date();
  const yyyymmdd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const seq = String(counter++).padStart(4, '0');
  return `${locationCode}-${yyyymmdd}-${seq}`;
}
export function generateRefundNumber(): string {
  return `REF-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
