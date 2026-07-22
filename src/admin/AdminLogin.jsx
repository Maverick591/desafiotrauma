import { useState } from 'react'
import { ArrowLeft, KeyRound, Mail } from 'lucide-react'
import { Link } from 'react-router-dom'
import { sendMagicLink } from './adminApi.js'

export function AdminLogin({ configured = true }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  async function submit(event) {
    event.preventDefault()
    setStatus('loading')
    setMessage('')
    try {
      await sendMagicLink(email)
      setStatus('sent')
      setMessage('Enviamos um link de acesso para o e-mail informado.')
    } catch (error) {
      setStatus('error')
      setMessage(error?.message || 'Não foi possível enviar o link.')
    }
  }

  return (
    <main className="auth-page" id="conteudo">
      <Link className="back-link" to="/"><ArrowLeft aria-hidden="true" /> Voltar ao painel</Link>
      <section className="auth-card">
        <div className="auth-card__icon"><KeyRound aria-hidden="true" /></div>
        <h1>Área restrita</h1>
        <p>Use o e-mail autorizado para receber um link de acesso único.</p>
        {!configured ? <div className="notice notice--error" role="alert">Supabase não configurado neste ambiente.</div> : (
          <form onSubmit={submit}>
            <label className="text-field"><span>E-mail institucional</span><div><Mail aria-hidden="true" /><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@instituicao.br" /></div></label>
            <button className="button button--primary button--full" disabled={status === 'loading' || status === 'sent'} type="submit">{status === 'loading' ? 'Enviando…' : 'Enviar magic link'}</button>
            {message ? <div className={`notice${status === 'error' ? ' notice--error' : ''}`} role="status">{message}</div> : null}
          </form>
        )}
        <small>O cadastro é fechado. Apenas usuários presentes na allowlist e autorizados por RLS acessam os dados.</small>
      </section>
    </main>
  )
}
