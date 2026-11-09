export default function ScoreProgressionChart({ history }) {
  const points = history.filter(result => Number.isFinite(result.percentage))
  const width = 720
  const height = 240
  const inset = { top: 20, right: 20, bottom: 42, left: 44 }
  const chartWidth = width - inset.left - inset.right
  const chartHeight = height - inset.top - inset.bottom
  const coordinates = points.map((point, index) => ({
    x: inset.left + (points.length < 2 ? chartWidth / 2 : index * chartWidth / (points.length - 1)),
    y: inset.top + chartHeight * (1 - point.percentage / 100),
    point,
  }))

  if (!points.length) {
    return <p className="reports-empty-inline">No scored submissions are available for this progression chart.</p>
  }

  return (
    <svg
      className="score-progression-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby="score-chart-title score-chart-description"
    >
      <title id="score-chart-title">Student score progression</title>
      <desc id="score-chart-description">
        Scores across {points.length} completed attempts, ordered from oldest to newest.
      </desc>
      {[0, 25, 50, 75, 100].map(value => {
        const y = inset.top + chartHeight * (1 - value / 100)
        return (
          <g key={value}>
            <line x1={inset.left} x2={width - inset.right} y1={y} y2={y} className="score-chart-gridline" />
            <text x={inset.left - 10} y={y + 4} textAnchor="end" className="score-chart-axis-label">{value}%</text>
          </g>
        )
      })}
      <polyline
        points={coordinates.map(({ x, y }) => `${x},${y}`).join(' ')}
        className="score-chart-line"
      />
      {coordinates.map(({ x, y, point }) => (
        <circle key={point._id} cx={x} cy={y} r="5" className="score-chart-point">
          <title>{`Attempt ${point.attemptNumber}: ${point.percentage}% on ${new Date(point.submittedAt).toLocaleDateString()}`}</title>
        </circle>
      ))}
      <text x={inset.left} y={height - 12} className="score-chart-axis-label">Oldest</text>
      <text x={width - inset.right} y={height - 12} textAnchor="end" className="score-chart-axis-label">Newest</text>
    </svg>
  )
}
