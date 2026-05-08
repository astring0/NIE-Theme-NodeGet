# NodeGet-StatusShow

一个轻量的 NodeGet 探针状态展示页，支持多主控、多节点筛选、卡片 / 表格 / 地图视图、三网 TCPing、费用统计、自定义背景和浅色 / 深色模式。

## 功能

- 多个 NodeGet 主控统一展示
- 节点卡片、表格、2D 地图、3D 地球视图
- CPU、内存、磁盘、Swap、上下行、运行时间等实时数据
- 三网 TCPing 延迟展示和历史条
- 地区、标签、名称搜索和排序
- 到期时间、剩余价值、月成本统计
- 自定义背景样式和主题色联动
- 浅色 / 深色模式
- 纯静态前端，可部署到 Cloudflare Pages、Vercel、Nginx、静态对象存储等环境

## 快速开始

```bash
npm install
npm run dev
```

构建：

```bash
npm run typecheck
npm run build
```

构建产物在 `dist/`，直接部署这个目录即可。

## 配置方式

项目会从 `public/config.json` 读取配置。也可以通过环境变量在构建时自动生成 `public/config.json`。

### 使用环境变量

环境变量在 `npm run build` 时注入，改完环境变量后必须重新构建 / 重新部署。

```bash
SITE_NAME=NodeGet Status
SITE_LOGO=https://example.com/logo.png
SITE_FOOTER=Powered by NodeGet
REFRESH_INTERVAL_MS=2000
SITE_1=name="master-1",backend_url="wss://m1.example.com",token="abc123"
SITE_2=name="master-2",backend_url="wss://m2.example.com",token="xyz789"
```

说明：

- `SITE_NAME`：站点名称
- `SITE_LOGO`：站点 Logo，支持 URL，也可以填静态资源路径
- `SITE_FOOTER`：页脚文本
- `REFRESH_INTERVAL_MS`：动态数据刷新间隔，单位毫秒，默认 `2000`，最小 `1000`，最大 `60000`
- `SITE_n`：主控配置，从 `SITE_1` 开始连续递增，中间断号后面的不会继续读取

`SITE_n` 支持字段：

- `name`：主控名称
- `backend_url`：NodeGet 主控 WSS 地址
- `token`：API Token

### 使用 config.json

也可以手动创建：

```json
{
  "site_name": "NodeGet Status",
  "site_logo": "/logo.png",
  "footer": "Powered by NodeGet",
  "refresh_interval_ms": 2000,
  "site_tokens": [
    {
      "name": "master-1",
      "backend_url": "wss://m1.example.com",
      "token": "abc123"
    }
  ]
}
```

## 节点元数据

节点名称、地区、标签、经纬度、价格、到期时间等信息来自前端配置 / 节点元数据。设置经纬度后，地图页会自动显示节点位置。

常用字段：

```ts
{
  name: "Oracle PHX ARM",
  region: "US",
  tags: ["oracle", "arm"],
  hidden: false,
  virtualization: "KVM",
  lat: 33.4484,
  lng: -112.074,
  order: 1,
  price: 0,
  priceUnit: "CNY",
  priceCycle: 30,
  expireTime: "2026-12-31"
}
```

## 地图视图

地图页包含两种模式：

- `2D Map`：传统平面世界地图
- `3D Map`：基于 Three.js 的可拖动地球，不依赖外部地图服务

3D 地图支持鼠标 / 触摸拖动、滚轮 / 双指缩放、自动缓慢自转、节点聚合和节点信息弹窗。

## 主题与背景

右上角画笔按钮可以调整背景样式。颜色切换不只影响背景，也会轻微联动：

- 卡片边框
- 虚线分割线
- 圆环底圈
- 输入框和按钮边框
- 地图面板线条
- 深色模式下的同类线条

这些设置保存在访客自己的浏览器中，不会影响其他人。

## 部署

### Cloudflare Pages

1. Fork / 上传项目
2. 在 Pages 中选择仓库
3. 构建命令：`npm run build`
4. 输出目录：`dist`
5. 在环境变量中配置 `SITE_1`、`SITE_2` 等
6. 重新部署

### Vercel

1. 导入项目
2. Framework 选择 Vite
3. Build Command：`npm run build`
4. Output Directory：`dist`
5. 配置环境变量并重新部署

### Nginx / 静态服务器

```bash
npm install
npm run build
```

把 `dist/` 里的文件上传到站点目录即可。

## 常见问题

### 改了环境变量但页面没变

环境变量是构建时写入的，改完必须重新执行构建或重新部署。

### 页面没有节点

检查：

- `backend_url` 是否是可访问的 WSS 地址
- `token` 是否正确
- 浏览器控制台是否有 WSS 连接错误
- NodeGet 主控是否允许当前前端访问

### 地图没有显示某些节点

地图只显示设置了 `lat` 和 `lng` 的节点。

### 访问人数多时主控负载高

前端会按 `refresh_interval_ms` 直接请求主控。访问量大时建议：

- 适当提高 `REFRESH_INTERVAL_MS`
- 使用 CDN 缓存静态资源
- 后续可加一层后端 / Worker 聚合，让所有访客读取同一份短周期缓存数据

## 许可

见 `LICENSE`。
