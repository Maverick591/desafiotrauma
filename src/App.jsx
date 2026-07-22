import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { PublicLayout } from './components/layout/PublicLayout.jsx'

const AdminPage = lazy(() => import('./pages/AdminPage.jsx').then((module) => ({ default: module.AdminPage })))
const ExperiencePage = lazy(() => import('./pages/ExperiencePage.jsx').then((module) => ({ default: module.ExperiencePage })))
const LearningPage = lazy(() => import('./pages/LearningPage.jsx').then((module) => ({ default: module.LearningPage })))
const OverviewPage = lazy(() => import('./pages/OverviewPage.jsx').then((module) => ({ default: module.OverviewPage })))
const ParticipationPage = lazy(() => import('./pages/ParticipationPage.jsx').then((module) => ({ default: module.ParticipationPage })))
const TopicsPage = lazy(() => import('./pages/TopicsPage.jsx').then((module) => ({ default: module.TopicsPage })))

export default function App() {
  return (
    <Suspense fallback={<main className="route-loading" id="conteudo" role="status">Carregando painel…</main>}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="participacao" element={<ParticipationPage />} />
          <Route path="aprendizagem" element={<LearningPage />} />
          <Route path="avaliacao" element={<ExperiencePage />} />
          <Route path="assuntos" element={<TopicsPage />} />
        </Route>
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Suspense>
  )
}
