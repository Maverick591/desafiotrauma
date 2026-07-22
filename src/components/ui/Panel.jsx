export function Panel({ children, className = '', as: Tag = 'section', ...props }) {
  return <Tag className={`panel ${className}`.trim()} {...props}>{children}</Tag>
}

export function SectionHeading({ title, description, action }) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  )
}
