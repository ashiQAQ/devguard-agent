import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Requirement, Analysis, Simulation, User, RequirementValidationReport } from '../types'
import apiClient from '../api/client'

export const useAppStore = defineStore('app', () => {
  // 状态
  const requirements = ref<Requirement[]>([])
  const analyses = ref<Analysis[]>([])
  const simulations = ref<Simulation[]>([])
  const loading = ref(false)
  const currentUser = ref<User>({
    id: '1',
    username: 'demo',
    name: '张三',
    role: 'admin',
    avatar: '',
    email: 'demo@example.com',
  })
  const isLoggedIn = ref(!!localStorage.getItem('token'))

  // 计算属性
  const requirementCount = computed(() => requirements.value.length)
  const analysisCount = computed(() => analyses.value.length)
  const simulationCount = computed(() => simulations.value.length)

  // 初始化模拟数据
  const initMockData = () => {
    requirements.value = [
      {
        id: '1',
        req_id: 'BR-2025-Q1-001',
        title: '车辆速度控制功能',
        description: '实现车辆速度闭环控制，支持定速巡航和自适应巡航模式',
        content: '## 功能描述\n\n实现车辆速度控制功能，支持以下模式：\n\n1. 定速巡航模式\n2. 自适应巡航模式\n\n## 验收标准\n\n- 速度控制精度 ±1km/h\n- 响应时间 < 100ms\n- 支持速度范围 0-200km/h',
        format: 'markdown',
        req_type: 'BUSINESS',
        priority: 'P1',
        module: '动力控制',
        asil: 'B',
        status: 'pending',
        created_at: '2026-03-28 10:00:00',
        updated_at: '2026-03-28 10:00:00',
      },
      {
        id: '2',
        req_id: 'TR-2025-Q1-002',
        title: 'CAN 信号解析性能优化',
        description: '优化 CAN 信号解析模块性能，降低 CPU 占用',
        content: '## 技术要求\n\n优化 CAN 信号解析模块：\n\n- CPU 占用降低 30%\n- 内存占用 < 50MB\n- 支持高并发 1000 条/秒',
        format: 'markdown',
        req_type: 'TECHNICAL',
        priority: 'P2',
        module: '通信模块',
        asil: 'A',
        status: 'confirmed',
        created_at: '2026-03-29 14:30:00',
        updated_at: '2026-03-29 14:30:00',
      },
      {
        id: '3',
        req_id: 'SY-2025-Q1-003',
        title: '速度档位联动条件',
        description: '定义速度与档位的联动约束条件',
        content: '## 符号条件\n\n当车速超过 100km/h 时，档位必须为 D 档。',
        format: 'markdown',
        req_type: 'SYMBOLIC',
        priority: 'P1',
        module: '动力控制',
        asil: 'C',
        status: 'pending',
        conditions: 'carSpeed>100km/h, geer=D',
        created_at: '2026-03-30 09:00:00',
        updated_at: '2026-03-30 09:00:00',
      } as any,
    ]

    analyses.value = [
      {
        id: '1',
        requirement_id: 'BR-2025-Q1-001',
        analysis_type: 'FLOW_A',
        status: 'success',
        result: { features: 5, alignment: 0.85 },
        created_at: '2026-03-28 11:00:00',
        completed_at: '2026-03-28 11:05:00',
      },
      {
        id: '2',
        requirement_id: 'TR-2025-Q1-002',
        analysis_type: 'FLOW_A',
        status: 'pending',
        result: {},
        created_at: '2026-03-29 15:00:00',
        completed_at: '',
      },
    ]

    simulations.value = [
      {
        id: '1',
        requirement_id: 'BR-2025-Q1-001',
        scenario_path: '/scenarios/highway_001.dbc',
        playback_speed: 1.0,
        duration_sec: 300,
        status: 'completed',
        passed: true,
        results: { latency_avg: 45, latency_max: 78 },
        report: {},
        created_at: '2026-03-28 12:00:00',
        started_at: '2026-03-28 12:01:00',
        completed_at: '2026-03-28 12:06:00',
      },
    ]
  }

  // 登录
  const login = async (username: string, password: string): Promise<boolean> => {
    loading.value = true
    try {
      // 模拟登录
      await new Promise(resolve => setTimeout(resolve, 500))
      
      if (username === 'demo' && password === 'demo123') {
        const token = 'demo-token-' + Date.now()
        localStorage.setItem('token', token)
        localStorage.setItem('username', username)
        isLoggedIn.value = true
        currentUser.value = {
          id: '1',
          username: 'demo',
          name: '张三',
          role: 'admin',
          avatar: '',
          email: 'demo@example.com',
        }
        return true
      }
      return false
    } finally {
      loading.value = false
    }
  }

  // 登出
  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    isLoggedIn.value = false
    currentUser.value = {
      id: '',
      username: '',
      name: '',
      role: 'developer',
      avatar: '',
      email: '',
    }
  }

  // 获取需求列表
  const fetchRequirements = async () => {
    loading.value = true
    try {
      const response = await apiClient.requirements.list()
      if (response?.requirements) {
        requirements.value = response.requirements
      }
    } catch (error) {
      console.error('获取需求列表失败:', error)
      // 使用模拟数据
      initMockData()
    } finally {
      loading.value = false
    }
  }

  // 获取分析列表
  const fetchAnalyses = async () => {
    loading.value = true
    try {
      const response = await apiClient.analysis.list()
      if (response?.analyses) {
        analyses.value = response.analyses
      }
    } catch (error) {
      console.error('获取分析列表失败:', error)
    } finally {
      loading.value = false
    }
  }

  // 获取仿真列表
  const fetchSimulations = async () => {
    loading.value = true
    try {
      const response = await apiClient.simulation.list()
      if (response?.simulations) {
        simulations.value = response.simulations
      }
    } catch (error) {
      console.error('获取仿真列表失败:', error)
    } finally {
      loading.value = false
    }
  }

  // 创建需求
  const createRequirement = async (data: Partial<Requirement>) => {
    loading.value = true
    try {
      const result = await apiClient.requirements.create(data)
      if (result?.data) {
        requirements.value.push(result.data)
      }
      return result
    } catch (error) {
      console.error('创建需求失败:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  // 校验需求
  const validateRequirement = async (data: any): Promise<RequirementValidationReport> => {
    loading.value = true
    try {
      const result = await apiClient.requirements.validate(data)
      return result as RequirementValidationReport
    } catch (error) {
      console.error('校验需求失败:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  // 解析符号条件
  const parseSymbolicConditions = async (conditions: string) => {
    try {
      const result = await apiClient.requirements.parseSymbolic({
        id: 'temp',
        title: 'temp',
        conditions,
      })
      return result
    } catch (error) {
      console.error('解析符号条件失败:', error)
      throw error
    }
  }

  // 分析需求
  const analyzeRequirement = async (requirementId: string) => {
    loading.value = true
    try {
      const result = await apiClient.requirements.analyze(requirementId)
      return result
    } catch (error) {
      console.error('分析需求失败:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  // 分析 PR
  const analyzePR = async (prNumber: number) => {
    loading.value = true
    try {
      const result = await apiClient.analysis.pr({ number: prNumber })
      analyses.value.push(result)
      return result
    } catch (error) {
      console.error('分析 PR 失败:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  // 运行仿真
  const runSimulation = async (data: Partial<Simulation>) => {
    loading.value = true
    try {
      const result = await apiClient.simulation.run(data)
      simulations.value.push(result)
      return result
    } catch (error) {
      console.error('运行仿真失败:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  return {
    // 状态
    requirements,
    analyses,
    simulations,
    loading,
    currentUser,
    isLoggedIn,
    // 计算属性
    requirementCount,
    analysisCount,
    simulationCount,
    // 方法
    initMockData,
    login,
    logout,
    fetchRequirements,
    fetchAnalyses,
    fetchSimulations,
    createRequirement,
    validateRequirement,
    parseSymbolicConditions,
    analyzeRequirement,
    analyzePR,
    runSimulation,
  }
})
