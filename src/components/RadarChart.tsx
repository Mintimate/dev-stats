import type { DimensionScores } from "../lib/types";

const keys = [
  { name: "账号成熟度", key: "maturity", align: "middle", dy: -6 },
  { name: "原创项目质量", key: "original_projects", align: "start", dx: 6, dy: 4 },
  { name: "贡献质量", key: "contributions", align: "start", dx: 6, dy: 4 },
  { name: "生态影响力", key: "influence", align: "middle", dy: 14 },
  { name: "社区影响力", key: "community", align: "end", dx: -6, dy: 4 },
  { name: "活跃真实性", key: "activity", align: "end", dx: -6, dy: 4 },
] as const;

export function RadarChart({ scores }: { scores: DimensionScores }) {
  const cx = 110;
  const cy = 110;
  const r = 65;
  const maxVal = 20;

  const pointFor = (index: number, value: number) => {
    const angle = (index * 60 - 90) * Math.PI / 180;
    const ratio = Math.min(Math.max(value, 0), maxVal) / maxVal;
    const pointR = r * ratio;
    return {
      x: cx + pointR * Math.cos(angle),
      y: cy + pointR * Math.sin(angle),
    };
  };

  const polygon = keys.map((item, index) => {
    const point = pointFor(index, Number(scores[item.key] ?? 10));
    return `${point.x},${point.y}`;
  }).join(" ");

  return (
    <svg width="250" height="250" viewBox="0 0 220 220" className="radar-svg">
      {[5, 10, 15, 20].map((level) => {
        const levelR = r * (level / maxVal);
        const points = Array.from({ length: 6 }, (_, index) => {
          const angle = (index * 60 - 90) * Math.PI / 180;
          return `${cx + levelR * Math.cos(angle)},${cy + levelR * Math.sin(angle)}`;
        }).join(" ");
        return <polygon key={level} points={points} className="radar-grid" />;
      })}
      {keys.map((item, index) => {
        const point = pointFor(index, maxVal);
        return <line key={item.key} x1={cx} y1={cy} x2={point.x} y2={point.y} className="radar-axis" />;
      })}
      <polygon points={polygon} className="radar-polygon" />
      {keys.map((item, index) => {
        const value = Number(scores[item.key] ?? 10);
        const point = pointFor(index, value);
        return <circle key={item.key} cx={point.x} cy={point.y} r="3.5" className="radar-point" />;
      })}
      {keys.map((item, index) => {
        const angle = (index * 60 - 90) * Math.PI / 180;
        const labelR = r + 15;
        const x = cx + labelR * Math.cos(angle);
        const y = cy + labelR * Math.sin(angle);
        const value = Number(scores[item.key] ?? 10);
        return (
          <g key={`${item.key}-label`}>
            <text x={x} y={y} dx={"dx" in item ? item.dx : 0} dy={item.dy} textAnchor={item.align} className="radar-label">
              {item.name}
            </text>
            <text x={x} y={y} dx={"dx" in item ? item.dx : 0} dy={item.dy + 11} textAnchor={item.align} className="radar-score-text">
              {value.toFixed(1)} / 20
            </text>
          </g>
        );
      })}
    </svg>
  );
}
