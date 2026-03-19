export function withX402Server() {
  return (req: any) => new Response('{}');
}
export function createPaymentFetch() {
  return fetch;
}
