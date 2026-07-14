#!/bin/sh
# 生成运行时配置 JS 文件
# 从容器环境变量读取，写入 runtime-config.js

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__RUNTIME_CONFIG__ = {
  API_BASE_URL: '${API_BASE_URL:-http://localhost:9800/api/v1}',
  HF_SERVER_URL: '${HF_SERVER_URL:-http://localhost:9801}',
  MS_SERVER_URL: '${MS_SERVER_URL:-http://localhost:9802}',
  APP_VERSION: '${APP_VERSION:-1.0.0}',
  APP_COPYRIGHT: '${APP_COPYRIGHT:-© 2026 Mini-HF Project}',
  EMAIL_DOMAIN: '${EMAIL_DOMAIN:-mini-hf.com}'
};
EOF

echo "Runtime config generated:"
cat /usr/share/nginx/html/runtime-config.js

exec "$@"