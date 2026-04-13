# 构建阶段
FROM node:20-alpine AS builder

# 安装 pnpm
RUN npm install -g pnpm

# 设置工作目录
WORKDIR /app

# 定义构建参数
ARG APP_HF_SERVER_URL
ARG APP_API_BASE_URL
ARG APP_VERSION=1.0.0
ARG APP_COPYRIGHT='© 2025 by realtyz'

# 设置为环境变量供构建使用
ENV APP_HF_SERVER_URL=${APP_HF_SERVER_URL}
ENV APP_API_BASE_URL=${APP_API_BASE_URL}
ENV APP_VERSION=${APP_VERSION}
ENV APP_COPYRIGHT=${APP_COPYRIGHT}

# 复制 package.json 和 pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建应用
RUN pnpm build

# 生产阶段
FROM nginx:alpine

# 复制构建产物到 nginx 目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
