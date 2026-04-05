import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'

class ApiClient {
  private client: AxiosInstance

  constructor(baseURL: string = '/api') {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // 请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token')
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    // 响应拦截器
    this.client.interceptors.response.use(
      (response) => response.data,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token')
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    )
  }

  // 需求 API
  requirements = {
    list: (params?: any) => this.client.get('/requirements/list', { params }),
    create: (data: any) => this.client.post('/requirements/create', data),
    get: (id: string) => this.client.get(`/requirements/${id}`),
    update: (id: string, data: any) => this.client.put(`/requirements/${id}`, data),
    delete: (id: string) => this.client.delete(`/requirements/${id}`),
    analyze: (id: string) => this.client.post(`/requirements/${id}/analyze`),
    confirm: (id: string, data: any) => this.client.post(`/requirements/${id}/confirm`, data),
    // 强校验
    validate: (data: any) => this.client.post('/requirements/validate', data),
    // 解析符号条件
    parseSymbolic: (data: any) => this.client.post('/requirements/parse-symbolic', data),
    // 与前一条需求对比
    diff: (reqId: string, prevReqId: string) =>
      this.client.post('/requirements/diff', { req_id: reqId, prev_req_id: prevReqId }),
  }

  // 分析 API
  analysis = {
    list: (params?: any) => this.client.get('/analysis/list', { params }),
    pr: (data: any) => this.client.post('/analysis/pr', data),
    getPR: (prNumber: number) => this.client.get(`/analysis/pr/${prNumber}`),
    confirmPR: (prNumber: number, data: any) =>
      this.client.post(`/analysis/pr/${prNumber}/confirm`, data),
  }

  // 仿真 API
  simulation = {
    list: (params?: any) => this.client.get('/simulation/list', { params }),
    run: (data: any) => this.client.post('/simulation/run', data),
    getStatus: (id: string) => this.client.get(`/simulation/status/${id}`),
    getResults: (id: string) => this.client.get(`/simulation/results/${id}`),
    confirm: (id: string, data: any) =>
      this.client.post(`/simulation/results/${id}/confirm`, data),
  }

  // 基线 API
  baselines = {
    list: (params?: any) => this.client.get('/baselines/list', { params }),
    create: (data: any) => this.client.post('/baselines/create', data),
    get: (id: string) => this.client.get(`/baselines/${id}`),
    update: (id: string, data: any) => this.client.put(`/baselines/${id}`, data),
    delete: (id: string) => this.client.delete(`/baselines/${id}`),
    getVersions: (id: string) => this.client.get(`/baselines/${id}/versions`),
    rollback: (id: string, version: string) =>
      this.client.post(`/baselines/${id}/rollback`, { version }),
  }

  // Webhook API
  webhook = {
    github: (data: any) => this.client.post('/webhook/github/webhook', data),
    status: () => this.client.get('/webhook/github/status'),
  }

  // AI 分析 API
  ai = {
    analyze: (data: any) => this.client.post('/ai/analyze', data),
    extractFeatures: (content: string) => this.client.post('/ai/extract-features', { content }),
    analyzeRisks: (requirementId: string, content: string) => 
      this.client.post('/ai/analyze-risks', { requirement_id: requirementId, content }),
    codeSuggestions: (requirement: string, language = 'cpp') =>
      this.client.post('/ai/code-suggestions', { requirement, language }),
    similarity: (text1: string, text2: string) =>
      this.client.post('/ai/similarity', { text1, text2 }),
    insight: (content: string) => this.client.post('/ai/insight', { content }),
    models: () => this.client.get('/ai/models'),
  }
}

const apiClient = new ApiClient()
export default apiClient

// 便捷导出
export const analyzeRequirement = (data: any) => apiClient.ai.analyze(data)
export const extractFeatures = (content: string) => apiClient.ai.extractFeatures(content)
export const analyzeRisks = (reqId: string, content: string) => apiClient.ai.analyzeRisks(reqId, content)
export const getCodeSuggestionsApi = (requirement: string) => apiClient.ai.codeSuggestions(requirement)
export const getModels = () => apiClient.ai.models()
