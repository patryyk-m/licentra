export default function MetricCard({ label, value }) {
  return (
    <div className="rounded-lg border bg-card text-card-foreground p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="text-3xl font-bold mb-2 text-primary">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

