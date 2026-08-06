// ─── Document types + how many approvers each requires ─────────────────────

export const DOC_TYPES = [
  { value: "proposal", label: "Proposal", approverCount: 3 },
  { value: "invoice",  label: "Invoice",  approverCount: 2 },
];

export const getApproverCount = (docTypeValue) =>
  DOC_TYPES.find((d) => d.value === docTypeValue)?.approverCount ?? 3;

export const getDocTypeLabel = (docTypeValue) =>
  DOC_TYPES.find((d) => d.value === docTypeValue)?.label ?? docTypeValue;
