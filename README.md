# NodeGet-StatusShow

一个部署在静态托管上的 NodeGet 探针前端页面。

这份版本已经额外包含：

- 节点详情页中间位置的 **延迟图表**
- 同一节点下 **多个延迟监控目标同时显示**（例如上海电信 / 联通 / 移动）
- 每个监控项 **独立颜色**
- 图表下方 **点击筛选监控项**，支持单选 / 多选叠加
- **平滑** 开关，可切换平滑折线

## 开发

```bash
npm i
npm run dev
```

## 部署

构建后是纯静态站，可以部署到 Cloudflare Pages、Vercel 或任意静态托管平台。

### Cloudflare Pages（推荐）

直接连接 GitHub 仓库，使用下面配置：

- **Build command**: `npm run build`
- **Build output directory**: `dist`

> 环境变量是 **build 时** 注入的。改完变量后，必须重新部署一次才会生效；只在面板里修改变量、不重新跑 build 是没用的。

## 环境变量

```env
SITE_NAME=狼牙的探针
SITE_LOGO=https://example.com/logo.png
SITE_FOOTER=Powered by NodeGet
SITE_1=name="master-1",backend_url="wss://m1.example.com",token="abc123"
SITE_2=name="master-2",backend_url="wss://m2.example.com",token="xyz789"
```

前三个对应：

- `SITE_NAME` -> `site_name`
- `SITE_LOGO` -> `site_logo`
- `SITE_FOOTER` -> `footer`

`SITE_n` 是主控配置，值用 `key="value"` 的形式，用逗号拼接；支持字段：

- `name`
- `backend_url`
- `token`

例如：

```env
SITE_1=name="master-1",backend_url="wss://m1.example.com",token="abc123"
```

### 注意事项

- 从 `SITE_1` 开始连续编号，中间断了就会停止读取。
- 所以新增主控请继续往后写：`SITE_3`、`SITE_4` ...
- 如果值里要包含引号或反斜杠，请使用 `\"` 和 `\\` 转义。
- 没有设置任何 `SITE_n` 时，构建脚本不会生成 `public/config.json`。

## 一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/NodeSeekDev/NodeGet-StatusShow&env=SITE_1,SITE_NAME,SITE_LOGO,SITE_FOOTER&envDescription=站点信息和主控连接&envLink=https://github.com/NodeSeekDev/NodeGet-StatusShow%23环境变量)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/NodeSeekDev/NodeGet-StatusShow)
