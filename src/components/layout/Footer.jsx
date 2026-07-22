import { ExternalLink, Instagram } from 'lucide-react'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div>
          <p className="site-footer__name">Dr. Jocielle Miranda</p>
          <p>Developer novas tecnologias aplicadas à medicina.</p>
        </div>
        <nav aria-label="Links externos" className="site-footer__links">
          <a href="https://x.com/jociellemiranda" target="_blank" rel="noreferrer">X <ExternalLink aria-hidden="true" /></a>
          <a href="https://www.instagram.com/drjociellemiranda/" target="_blank" rel="noreferrer"><Instagram aria-hidden="true" /> Instagram</a>
          <a href="https://www.cirurgiageralusp.com" target="_blank" rel="noreferrer">Cirurgia Geral USP <ExternalLink aria-hidden="true" /></a>
        </nav>
      </div>
      <p className="site-footer__copyright">© {new Date().getFullYear()} Dr. Jocielle Miranda. Todos os direitos reservados.</p>
    </footer>
  )
}
