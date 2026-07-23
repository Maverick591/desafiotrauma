import { useId } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export const chartColors = ['#0f766e', '#4c6fff', '#d92d20', '#7c3aed', '#e79d13', '#2a9d8f']
const tooltipStyle = { borderRadius: 12, border: '1px solid #dce2ea', boxShadow: '0 10px 30px rgba(20,33,61,.1)' }
const formattedValue = (value, suffix = '') => value == null ? '—' : `${typeof value === 'number' ? Math.round(value * 100) / 100 : value}${suffix}`

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

export function TrendChart({ data, areas, valueSuffix = '', domain = ['auto', 'auto'] }) {
  const gradientPrefix = useId().replaceAll(':', '')
  if (!data?.length) return <p className="chart-empty">Sem série temporal para esta seleção.</p>
  return (
    <>
      <div className="chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <defs>
            {areas.map((area, index) => (
              <linearGradient id={`${gradientPrefix}-fill-${area.key}`} x1="0" y1="0" x2="0" y2="1" key={area.key}>
                <stop offset="5%" stopColor={area.color || chartColors[index]} stopOpacity={0.22} />
                <stop offset="95%" stopColor={area.color || chartColors[index]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="#e8edf3" strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#657187', fontSize: 12 }} />
          <YAxis domain={domain} axisLine={false} tickLine={false} tick={{ fill: '#657187', fontSize: 12 }} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formattedValue(value, valueSuffix)]} />
          {areas.length > 1 ? <Legend iconType="circle" iconSize={8} /> : null}
          {areas.map((area, index) => (
            <Area
              key={area.key}
              type="monotone"
              dataKey={area.key}
              name={area.label}
              stroke={area.color || chartColors[index]}
              fill={`url(#${gradientPrefix}-fill-${area.key})`}
              strokeWidth={3}
              activeDot={{ r: 5 }}
              connectNulls
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
            {data.map((item, index) => <Cell key={item.label || index} fill={chartColors[index % chartColors.length]} />)}
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

export function MonthlyBarChart({ data }) {
  if (!data?.length) return <p className="chart-empty">Sem série mensal para esta seleção.</p>
  return (
    <>
      <div className="chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#e8edf3" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#657187', fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#657187', fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => [formattedValue(value), name]}
              labelFormatter={(label) => `Mês: ${label}`}
            />
            <Bar dataKey="participants" name="Participações" fill="#0f766e" radius={[8, 8, 2, 2]} maxBarSize={42} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <AccessibleChartTable caption="Participação mensal" data={data} columns={[
        { key: 'label', label: 'Mês' },
        { key: 'participants', label: 'Participações' },
        { key: 'responses', label: 'Respostas' },
        { key: 'presentations', label: 'Apresentações' },
      ]} />
    </>
  )
}

export function MultiLineChart({ data, lines, domain = ['auto', 'auto'], valueSuffix = '' }) {
  if (!data?.length || !lines?.length) return <p className="chart-empty">Sem série consolidada para esta seleção.</p>
  return (
    <>
      <div className="chart chart--tall" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="#e8edf3" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#657187', fontSize: 11 }} />
            <YAxis domain={domain} axisLine={false} tickLine={false} tick={{ fill: '#657187', fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formattedValue(value, valueSuffix), name]} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
            {lines.map((line, index) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={line.color || chartColors[index % chartColors.length]}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <AccessibleChartTable caption="Evolução consolidada das dimensões avaliadas" data={data} columns={[
        { key: 'label', label: 'Período' },
        ...lines.map((line) => ({ key: line.key, label: line.label })),
      ]} />
    </>
  )
}

export function RadarSummaryChart({ data }) {
  if (!data?.length) return <p className="chart-empty">Sem avaliação consolidada para esta seleção.</p>
  return (
    <>
      <div className="chart chart--compact" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="63%">
            <PolarGrid stroke="#dce2ea" />
            <PolarAngleAxis
              dataKey="shortLabel"
              tick={{ fill: '#526078', fontSize: 10, fontWeight: 700 }}
            />
            <PolarRadiusAxis domain={[1, 5]} tickCount={5} tick={{ fill: '#7c879a', fontSize: 9 }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${formattedValue(value)}/5`, 'Média']} />
            <Radar dataKey="score" name="Média" stroke="#0f766e" fill="#0f766e" fillOpacity={0.24} strokeWidth={2.5} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <AccessibleChartTable caption="Consolidado das dimensões avaliadas" data={data} columns={[
        { key: 'label', label: 'Dimensão' },
        { key: 'score', label: 'Média' },
        { key: 'responses', label: 'Avaliadores' },
      ]} />
    </>
  )
}

export function MiniTrendChart({ data, color = '#0f766e', label = 'Evolução' }) {
  if (!data?.length) return <p className="mini-chart-empty">Série temporal em formação.</p>
  return (
    <>
      <div className="mini-chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 5, left: 5, bottom: 2 }}>
            <XAxis dataKey="label" hide />
            <YAxis domain={[1, 5]} hide />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${formattedValue(value)}/5`, label]} />
            <Line type="monotone" dataKey="score" stroke={color} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <AccessibleChartTable caption={label} data={data} columns={[
        { key: 'label', label: 'Período' },
        { key: 'score', label: 'Média' },
        { key: 'responses', label: 'Avaliadores' },
      ]} />
    </>
  )
}

export function HistoricalComboChart({ data }) {
  if (!data?.length) return <p className="chart-empty">Sem histórico acadêmico para esta seleção.</p>
  return (
    <>
      <div className="chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 4, left: -14, bottom: 0 }}>
            <CartesianGrid stroke="#e8edf3" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#657187', fontSize: 11 }} />
            <YAxis yAxisId="volume" axisLine={false} tickLine={false} tick={{ fill: '#657187', fontSize: 11 }} allowDecimals={false} />
            <YAxis yAxisId="accuracy" orientation="right" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#657187', fontSize: 11 }} unit="%" />
            <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formattedValue(value, name === 'Acurácia' ? '%' : ''), name]} />
            <Legend iconType="circle" iconSize={8} />
            <Bar yAxisId="volume" dataKey="questions" name="Questões" fill="#bde4df" radius={[6, 6, 0, 0]} maxBarSize={34} />
            <Line yAxisId="accuracy" type="monotone" dataKey="accuracy" name="Acurácia" stroke="#d92d20" strokeWidth={3} dot={false} activeDot={{ r: 5 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <AccessibleChartTable caption="Histórico mensal das questões" data={data} columns={[
        { key: 'label', label: 'Mês' },
        { key: 'questions', label: 'Questões' },
        { key: 'answers', label: 'Respostas' },
        { key: 'accuracy', label: 'Acurácia (%)' },
      ]} />
    </>
  )
}
