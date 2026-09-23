const statusColor: Record<string, string> = {
  Active: "tag-green",
  Confirmed: "tag-green",
  Lead: "tag-blue",
  Draft: "tag-amber",
  Inactive: "tag-grey",
  Cancelled: "tag-red",
  IN: "tag-green",
  OUT: "tag-red",
};

export function StatusTag({ status }: { status: string }) {
  const cls = statusColor[status] || "tag-grey";
  return <span className={`tag ${cls}`}>{status}</span>;
}
