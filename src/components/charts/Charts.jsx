import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const colors = ['#0f766e', '#2a9d8f', '#5fbdb4', '#9bd9d3', '#14213d']
const tooltipStyle = { borderRadius: 12, border: '1px solid #dce2ea', boxShadow: '0 10px 30px rgba(20,33,61,.1)' }

function AccessibleChartTable({ caption, data, columns }) {
  return (
    <div className="sr-only-table">
      <table>
        <caption>{caption}</caption>
        <thead><tr>{columns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>{data.map((row, index) => (
          <tr key={row.label ?? index}>{columns.map((column) => <td key={column.key}>{row[column.key] ?? 'Dado não disponível'}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  )
}

export function TrendChart({ data, areas, valueSuffix = '' }) {
  if (!data?.length) return <p className="chart-empty">Sem série temporal para esta seleção.</p>
  return (
    <>
      <div className="chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <defs>
            {areas.map((area, index) => (
              <linearGradient id={`fill-${area.key}`} x1="0" y1="0" x2="0" y2="1" key={area.key}>
                <stop offset="5%" stopColor={area.color || colors[index]} stopOpacity={0.22} />
                <stop offset="95%" stopColor={area.color || colors[index]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="#e8edf3" strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#657187', fontSize: 12 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#657187', fontSize: 12 }} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value}${valueSuffix}`]} />
          {areas.length > 1 ? <Legend iconType="circle" iconSize={8} /> : null}
          {areas.map((area, index) => (
            <Area
              key={area.key}
              type="monotone"
              dataKey={area.key}
              name={area.label}
              stroke={area.color || colors[index]}
              fill={`url(#fill-${area.key})`}
              strokeWidth={3}
              activeDot={{ r: 5 }}
            />
          ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <AccessibleChartTable caption="Dados da evolução dos indicadores" data={data} columns={[{ key: 'label', label: 'Período' }, ...areas.map((area) => ({ key: area.key, label: `${area.label}${valueSuffix}` }))]} />
    </>
  )
}

export function HorizontalBarChart({ data, valueKey = 'value', suffix = '' }) {
  if (!data?.length) return <p className="chart-empty">Sem distribuição para esta seleção.</p>
  return (
    <>
      <div className="chart chart--compact" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 10, bottom: 0 }}>
          <CartesianGrid stroke="#e8edf3" strokeDasharray="4 4" horizontal={false} />
          <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#657187', fontSize: 12 }} />
          <YAxis type="category" dataKey="label" width={96} axisLine={false} tickLine={false} tick={{ fill: '#26334d', fontSize: 12 }} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value}${suffix}`]} />
          <Bar dataKey={valueKey} fill="#0f766e" radius={[0, 8, 8, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <AccessibleChartTable caption="Dados da distribuição" data={data} columns={[{ key: 'label', label: 'Categoria' }, { key: valueKey, label: `Valor${suffix}` }]} />
    </>
  )
}

export function DonutChart({ data }) {
  if (!data?.length) return <p className="chart-empty">Sem distribuição para esta seleção.</p>
  return (
    <>
      <div className="chart chart--compact" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={52} outerRadius={78} paddingAngle={3}>
            {data.map((item, index) => <Cell key={item.label || index} fill={colors[index % colors.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value}%`]} />
          <Legend iconType="circle" iconSize={8} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <AccessibleChartTable caption="Dados da composição percentual" data={data} columns={[{ key: 'label', label: 'Categoria' }, { key: 'value', label: 'Percentual' }]} />
    </>
  )
}
