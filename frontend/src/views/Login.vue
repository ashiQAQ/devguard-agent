<template>
  <div class="login-page">
    <div class="login-container">
      <div class="login-box">
        <!-- Logo -->
        <div class="logo-section">
          <h1>🛡️ DevGuard</h1>
          <p>代码质量守护系统</p>
        </div>

        <!-- 登录表单 -->
        <el-form
          ref="formRef"
          :model="formData"
          :rules="rules"
          @submit.prevent="handleLogin"
        >
          <el-form-item prop="username">
            <el-input
              v-model="formData.username"
              placeholder="用户名"
              prefix-icon="User"
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="formData.password"
              type="password"
              placeholder="密码"
              prefix-icon="Lock"
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <el-form-item prop="remember">
            <el-checkbox v-model="formData.remember">记住我</el-checkbox>
          </el-form-item>

          <el-button
            type="primary"
            @click="handleLogin"
            :loading="loading"
            style="width: 100%"
          >
            登录
          </el-button>
        </el-form>

        <!-- 其他选项 -->
        <div class="options">
          <el-link type="primary" @click="handleForgotPassword">忘记密码？</el-link>
          <el-link type="primary" @click="handleRegister">注册账户</el-link>
        </div>

        <!-- 演示账户 -->
        <el-divider />
        <div class="demo-info">
          <p>演示账户</p>
          <p>用户名: demo</p>
          <p>密码: demo123</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, FormInstance } from 'element-plus'

const router = useRouter()
const formRef = ref<FormInstance>()
const loading = ref(false)

const formData = reactive({
  username: 'demo',
  password: 'demo123',
  remember: true,
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const handleLogin = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    loading.value = true
    try {
      // 模拟登录
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // 保存 token
      localStorage.setItem('token', 'demo-token-' + Date.now())
      localStorage.setItem('username', formData.username)

      if (formData.remember) {
        localStorage.setItem('remember_username', formData.username)
      }

      ElMessage.success('登录成功')
      router.push('/dashboard')
    } catch (error) {
      ElMessage.error('登录失败')
    } finally {
      loading.value = false
    }
  })
}

const handleForgotPassword = () => {
  ElMessage.info('请联系管理员重置密码')
}

const handleRegister = () => {
  ElMessage.info('注册功能开发中')
}
</script>

<style scoped>
.login-page {
  width: 100%;
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-container {
  width: 100%;
  max-width: 400px;
  padding: 20px;
}

.login-box {
  background: white;
  border-radius: 8px;
  padding: 40px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.logo-section {
  text-align: center;
  margin-bottom: 30px;
}

.logo-section h1 {
  margin: 0;
  font-size: 32px;
  color: #667eea;
}

.logo-section p {
  margin: 10px 0 0 0;
  font-size: 14px;
  color: #999;
}

.options {
  display: flex;
  justify-content: space-between;
  margin-top: 15px;
  font-size: 12px;
}

.demo-info {
  text-align: center;
  font-size: 12px;
  color: #999;
}

.demo-info p {
  margin: 5px 0;
}

@media (max-width: 600px) {
  .login-box {
    padding: 30px 20px;
  }

  .logo-section h1 {
    font-size: 24px;
  }
}
</style>
