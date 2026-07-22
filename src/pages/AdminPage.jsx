import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { AdminDashboard } from '../admin/AdminDashboard.jsx'
import { AdminLogin } from '../admin/AdminLogin.jsx'
import { getAdminAccess, signOutAdmin } from '../admin/adminApi.js'
import { Footer } from '../components/layout/Footer.jsx'

export function AdminPage() {
  const [access, setAccess] = useState({ status: 'loading', session: null, allowed: false, configured: true, error: '' })

  async function checkAccess() {
    setAccess((current) => ({ ...current, status: 'loading', error: '' }))
    try {
      const next = await getAdminAccess()
      setAccess({ ...next, status: 'ready', error: '' })
    } catch (error) {
      setAccess({ status: 'error', session: null, allowed: false, configured: true, error: error?.message || 'Não foi possível verificar o acesso.' })
    }
  }

  useEffect(() => { checkAccess() }, [])

  if (access.status === 'loading') return <><main className="auth-page"><div className="state-card"><Loader2 className="spin" aria-hidden="true" /><h1>Verificando acesso</h1></div></main><Footer /></>
  if (!access.session) return <><AdminLogin configured={access.configured} /><Footer /></>
  if (!access.allowed) return (
    <><main className="auth-page" id="conteudo"><section className="auth-card"><div className="auth-card__icon auth-card__icon--error"><AlertTriangle aria-hidden="true" /></div><h1>Acesso não autorizado</h1><p>Este usuário não está ativo na allowlist administrativa.</p><button className="button button--secondary button--full" type="button" onClick={async () => { await signOutAdmin(); await checkAccess() }}>Sair</button></section></main><Footer /></>
  )
  return <AdminDashboard user={access.user} onSignOut={checkAccess} />
}
