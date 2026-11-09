export default function ReportStatCard({ label, value, note }) {
  return (
    <article className="report-stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
      {note && <span>{note}</span>}
    </article>
  )
}
