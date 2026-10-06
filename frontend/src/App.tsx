import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AskYourDataPage } from './pages/AskYourDataPage'
import { BIAnalystPage } from './pages/BIAnalystPage'
import { DashboardDetailPage } from './pages/DashboardDetailPage'
import { DashboardsPage } from './pages/DashboardsPage'
import { DataSourcesPage } from './pages/DataSourcesPage'
import { ForecastsPage } from './pages/ForecastsPage'
import { LandingPage } from './pages/LandingPage'
import { QueryHistoryPage } from './pages/QueryHistoryPage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SharedDashboardPage } from './pages/SharedDashboardPage'
import { AppStateProvider } from './state/AppState'

function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/share/:token" element={<SharedDashboardPage />} />
          <Route path="/" element={<LandingPage />} />
          <Route path="/ask" element={<AskYourDataPage />} />
          <Route path="/sources" element={<DataSourcesPage />} />
          <Route path="/history" element={<QueryHistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/dashboards" element={<DashboardsPage />} />
          <Route path="/dashboards/:dashboardId" element={<DashboardDetailPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/forecasts" element={<ForecastsPage />} />
          <Route path="/bi-analyst" element={<BIAnalystPage />} />
        </Routes>
      </BrowserRouter>
    </AppStateProvider>
  )
}

export default App
