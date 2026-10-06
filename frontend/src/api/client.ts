import axios from 'axios'
import type {
  ApiConnectionRequest,
  BiAnalysisResult,
  ChartSpec,
  Dashboard,
  DashboardJobStatus,
  ForecastResponse,
  OverviewResponse,
  PinnedChart,
  QueryAnswer,
  RecentSqlConnection,
  SchemaInfo,
  SourceInfo,
  SqlConnectionRequest,
  TableRelationship,
  TileSize,
  UrlConnectionRequest,
} from '../types'

const api = axios.create({ baseURL: '/api' })

export interface ApiErrorDetail {
  message: string
  raw_llm_text?: string | null
}

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length > 0) {
      // FastAPI/pydantic validation errors (422): a list of {loc, msg, ...} objects.
      const first = detail[0]
      const field = Array.isArray(first?.loc) ? first.loc[first.loc.length - 1] : undefined
      return field ? `${field}: ${first.msg}` : String(first?.msg ?? err.message)
    }
    if (detail && typeof detail === 'object' && 'message' in detail) {
      return (detail as ApiErrorDetail).message
    }
    return err.message
  }
  return String(err)
}

export async function uploadFile(file: File): Promise<{ source_id: string; schema: SchemaInfo }> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post('/datasources/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function connectSqlDataSource(req: SqlConnectionRequest): Promise<{ source_id: string; schema: SchemaInfo }> {
  const { data } = await api.post('/datasources/sql', req)
  return data
}

export async function fetchRecentSqlConnections(): Promise<RecentSqlConnection[]> {
  const { data } = await api.get('/datasources/sql/recent')
  return data
}

export async function deleteRecentSqlConnection(id: string): Promise<void> {
  await api.delete(`/datasources/sql/recent/${id}`)
}

export async function uploadSqliteFile(file: File): Promise<{ source_id: string; schema: SchemaInfo }> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post('/datasources/sqlite/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function connectUrlDataSource(req: UrlConnectionRequest): Promise<{ source_id: string; schema: SchemaInfo }> {
  const { data } = await api.post('/datasources/url', req)
  return data
}

export async function connectApiDataSource(req: ApiConnectionRequest): Promise<{ source_id: string; schema: SchemaInfo }> {
  const { data } = await api.post('/datasources/api', req)
  return data
}

export async function listDataSources(): Promise<SourceInfo[]> {
  const { data } = await api.get('/datasources')
  return data
}

export async function refreshDataSource(sourceId: string): Promise<{ last_refreshed: string }> {
  const { data } = await api.post(`/datasources/${sourceId}/refresh`)
  return data
}

export async function setDataSourceSchedule(
  sourceId: string,
  intervalS: number | null,
): Promise<{ refresh_interval_s: number | null }> {
  const { data } = await api.put(`/datasources/${sourceId}/schedule`, { interval_s: intervalS })
  return data
}

export async function getSourceSchema(sourceId: string): Promise<SchemaInfo> {
  const { data } = await api.get(`/datasources/${sourceId}/schema`)
  return data
}

export async function deleteDataSource(sourceId: string): Promise<void> {
  await api.delete(`/datasources/${sourceId}`)
}

export async function runQuery(sourceId: string, question: string): Promise<QueryAnswer> {
  const { data } = await api.post('/query', { source_id: sourceId, question })
  return data
}

export async function modifyQuery(
  sourceId: string,
  question: string,
  previousSql: string,
  previousObjective: string,
  instruction: string,
): Promise<QueryAnswer> {
  const { data } = await api.post('/query/modify', {
    source_id: sourceId,
    question,
    previous_sql: previousSql,
    previous_objective: previousObjective,
    instruction,
  })
  return data
}

export async function checkHealth(): Promise<{ status: string; ollama_reachable: boolean }> {
  const { data } = await api.get('/health')
  return data
}

export async function startAutoDashboard(sourceId: string): Promise<{ job_id: string }> {
  const { data } = await api.post(`/datasources/${sourceId}/auto-dashboard`)
  return data
}

export async function getAutoDashboardStatus(jobId: string): Promise<DashboardJobStatus> {
  const { data } = await api.get(`/auto-dashboard/${jobId}`)
  return data
}

export async function getOverview(
  sourceId: string,
  params: { category?: string; year?: number; date_from?: string; date_to?: string } = {},
): Promise<OverviewResponse> {
  const { data } = await api.get(`/datasources/${sourceId}/overview`, { params })
  return data
}

export async function runBiAnalysis(sourceId: string, enrich: boolean = true): Promise<BiAnalysisResult> {
  const { data } = await api.post(`/bi-agent/${sourceId}/analyze`, null, { params: { enrich } })
  return data
}

export async function fetchDashboards(): Promise<Dashboard[]> {
  const { data } = await api.get('/dashboards')
  return data
}

export async function persistDashboard(dashboard: Dashboard): Promise<void> {
  await api.put(`/dashboards/${dashboard.id}`, {
    id: dashboard.id,
    name: dashboard.name,
    createdAt: dashboard.createdAt,
    updatedAt: dashboard.updatedAt,
  })
}

export async function deleteDashboardApi(dashboardId: string): Promise<void> {
  await api.delete(`/dashboards/${dashboardId}`)
}

export async function setDashboardFavoriteApi(dashboardId: string, isFavorite: boolean): Promise<void> {
  await api.put(`/dashboards/${dashboardId}/favorite`, { isFavorite })
}

export async function persistChart(dashboardId: string, chart: PinnedChart): Promise<void> {
  await api.put(`/dashboards/${dashboardId}/charts/${chart.id}`, chart)
}

export async function removeChartApi(dashboardId: string, chartId: string): Promise<void> {
  await api.delete(`/dashboards/${dashboardId}/charts/${chartId}`)
}

export async function updateChartAnswerApi(dashboardId: string, chartId: string, answer: QueryAnswer): Promise<void> {
  await api.put(`/dashboards/${dashboardId}/charts/${chartId}/answer`, answer)
}

export async function updateChartColorApi(dashboardId: string, chartId: string, color: string): Promise<void> {
  await api.put(`/dashboards/${dashboardId}/charts/${chartId}/color`, { color })
}

export async function updateChartSizeApi(dashboardId: string, chartId: string, size: TileSize): Promise<void> {
  await api.put(`/dashboards/${dashboardId}/charts/${chartId}/size`, { size })
}

export async function updateChartLiveApi(dashboardId: string, chartId: string, live: boolean): Promise<void> {
  await api.put(`/dashboards/${dashboardId}/charts/${chartId}/live`, { live })
}

/** Re-executes an already-known-good SQL string directly, with no LLM call — used for a
 * "live" chart's short-interval polling and for what-if analysis's substituted-literal runs. */
export async function rerunQuery(
  sourceId: string,
  sql: string,
  objective: string,
  chartSpec: ChartSpec,
): Promise<QueryAnswer> {
  const { data } = await api.post('/query/rerun', { source_id: sourceId, sql, objective, chart_spec: chartSpec })
  return data
}

export async function fetchTableRelationships(sourceId: string): Promise<TableRelationship[]> {
  const { data } = await api.get(`/sources/${sourceId}/relationships`)
  return data
}

export async function createTableRelationship(
  sourceId: string,
  req: { tableA: string; columnA: string; tableB: string; columnB: string },
): Promise<TableRelationship> {
  const { data } = await api.post(`/sources/${sourceId}/relationships`, req)
  return data
}

export async function deleteTableRelationship(sourceId: string, relationshipId: string): Promise<void> {
  await api.delete(`/sources/${sourceId}/relationships/${relationshipId}`)
}

export interface SharedDashboardLink {
  token: string
  dashboardId: string
  createdAt: string
}

export async function createShareLink(dashboardId: string): Promise<SharedDashboardLink> {
  const { data } = await api.post(`/dashboards/${dashboardId}/share`)
  return data
}

export async function revokeShareLink(dashboardId: string): Promise<void> {
  await api.delete(`/dashboards/${dashboardId}/share`)
}

export async function fetchSharedDashboard(token: string): Promise<Dashboard> {
  const { data } = await api.get(`/shared/${token}`)
  return data
}


export async function getForecast(
  sourceId: string,
  params: { value_field?: string; periods?: number } = {},
): Promise<ForecastResponse> {
  const { data } = await api.get(`/datasources/${sourceId}/forecast`, { params })
  return data
}
