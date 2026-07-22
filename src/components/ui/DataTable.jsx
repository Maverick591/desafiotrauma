export function DataTable({ columns, rows, caption }) {
  if (!rows?.length) return <p className="table-empty">Nenhum registro disponível para esta seleção.</p>
  return (
    <div className="table-wrap">
      <table>
        {caption ? <caption>{caption}</caption> : null}
        <thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id ?? row.question ?? row.topic ?? row.label ?? index}>
              {columns.map((column) => {
                const value = column.render ? column.render(row) : row[column.key]
                return <td key={column.key}>{value === null || value === undefined ? <span className="sr-only">Dado suprimido</span> : value}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
