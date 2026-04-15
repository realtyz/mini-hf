# 构建阶段
FROM node:20-alpine AS builder

# 安装 pnpm
RUN npm install -g pnpm

# 设置工作目录
WORKDIR /app

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

# 复制 entrypoint 脚本
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 运行时环境变量（无需重新构建镜像即可修改）：
#   API_BASE_URL    - 管理 API 地址（默认 http://localhost:9800/api/v1）
#   HF_SERVER_URL   - HF 服务地址（默认 http://localhost:9801）
#   APP_VERSION     - 版本号（默认 1.0.0）
#   APP_COPYRIGHT   - 版权信息（默认 © 2026 Mini-HF Project）
#   EMAIL_DOMAIN    - 邮箱域名占位符（默认 example.com）

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]