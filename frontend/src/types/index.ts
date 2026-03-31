// 需求类型
export interface Requirement {
  id: string
  req_id: string
  title: string
  description: string
  content: string
  format: 'markdown' | 'json' | 'yaml'
  req_type: 'BUSINESS' | 'TECHNICAL'
  priority: 'P0' | 'P1' | 'P2'
  module: string
  asil: string
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'rejected'
  created_at: string
  updated_at: string
}

// 功能点类型
export interface Feature {
  id: string
  requirement_id: string
  feature_id: string
  name: string
  description: string
  feature_type: 'BUSINESS' | 'TECHNICAL'
  phase: 'PRE_COMPILE' | 'COMPILE_TIME' | 'CODE_LOGIC' | 'SIGNAL_ALIGN' | 'RUNTIME_PERF'
  priority: 'P0' | 'P1' | 'P2'
  keywords: string[]
  acceptance: string[]
  constraint: string
  specified: boolean
  aligned_module: string
  alignment_score: number
  alignment_type: 'exact' | 'partial' | 'new'
}

// 分析类型
export interface Analysis {
  id: string
  requirement_id: string
  analysis_type: 'FLOW_A' | 'FLOW_B'
  status: 'success' | 'failed' | 'pending'
  result: Record<string, any>
  created_at: string
  completed_at: string
}

// PR 类型
export interface PullRequest {
  id: string
  pr_number: number
  title: string
  description: string
  author: string
  branch: string
  changed_files: number
  additions: number
  deletions: number
  can_merge: boolean
  analysis_result: Record<string, any>
  created_at: string
  analyzed_at: string
}

// Commit 类型
export interface Commit {
  id: string
  pr_id: string
  sha: string
  message: string
  author: string
  created_at: string
}

// Commit 校验结果
export interface CommitValidation {
  id: string
  pr_id: string
  commit_id: string
  status: 'PASS' | 'WARNING' | 'BLOCKED'
  semantic_match_score: number
  matched_keywords: string[]
  missing_keywords: string[]
  suggestion: string
  created_at: string
}

// 确认类型
export interface Confirmation {
  id: string
  requirement_id: string
  owner: string
  status: 'PENDING' | 'APPROVE' | 'CONDITIONAL' | 'REJECT'
  comment: string
  created_at: string
  confirmed_at: string
}

// 仿真类型
export interface Simulation {
  id: string
  requirement_id: string
  scenario_path: string
  playback_speed: number
  duration_sec: number
  status: 'running' | 'completed' | 'failed'
  passed: boolean
  results: Record<string, any>
  report: Record<string, any>
  created_at: string
  started_at: string
  completed_at: string
}

// 基线类型
export interface Baseline {
  id: string
  baseline_id: string
  name: string
  version: string
  language: string
  schema: Record<string, any>
  is_active: boolean
  parent_id: string
  created_at: string
  updated_at: string
}

// API 响应类型
export interface ApiResponse<T> {
  status: 'success' | 'failed'
  data?: T
  message?: string
  error?: string
}

// 分页响应
export interface PaginatedResponse<T> {
  status: 'success' | 'failed'
  total: number
  page: number
  page_size: number
  data: T[]
}

// 符号条件类型
export interface SymbolicCondition {
  variable: string
  operator: string
  value: any
  value_type: string
  unit: string
}

// 校验结果类型
export interface ValidationResult {
  is_valid: boolean
  level: 'error' | 'warning' | 'info'
  field: string
  message: string
  suggestion: string
  details: Record<string, any>
}

// 需求校验报告类型
export interface RequirementValidationReport {
  requirement_id: string
  is_valid: boolean
  results: ValidationResult[]
  symbolic_conditions: SymbolicCondition[]
  parsed_features: any[]
  summary: {
    total_checks: number
    error_count: number
    warning_count: number
    info_count: number
    symbolic_condition_count: number
    passed: boolean
    error_fields: string[]
    warning_fields: string[]
  }
}

// 用户类型
export interface User {
  id: string
  username: string
  name: string
  role: 'admin' | 'developer' | 'reviewer'
  avatar: string
  email: string
}
