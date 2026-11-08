export interface Policy {
  uploadKbps: number | null;
  downloadKbps: number | null;
  blocked: boolean;
}
export const unlimitedPolicy: Policy = {
  uploadKbps: null,
  downloadKbps: null,
  blocked: false,
};
export function policySummary(policy: Policy) {
  if (policy.blocked) return "Blocked · forwarded IPv4";
  return `↑ ${policy.uploadKbps === null ? "Unlimited" : `${policy.uploadKbps} kbps`} / ↓ ${policy.downloadKbps === null ? "Unlimited" : `${policy.downloadKbps} kbps`}`;
}
