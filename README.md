# koishi-plugin-group-gags

[![npm](https://img.shields.io/npm/v/koishi-plugin-group-gags?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-group-gags)

群聊整活合集 for Koishi：**「你好」回复**、**「问……」玩法**、**复读**、**Mock 名人名言模仿**。
数据来自 [koishi-plugin-chatlog](https://www.npmjs.com/package/koishi-plugin-chatlog) 收集器。

## 安装

```bash
npm install koishi-plugin-group-gags koishi-plugin-chatlog
```

需要 `koishi-plugin-chatlog`（数据层）、数据库插件，以及一个 **jieba 分词服务 provider**（二选一）：

```bash
npm install koishi-plugin-jieba        # @node-rs/jieba，同步，原生绑定
# 或
npm install koishi-plugin-hanlpjieba   # @azulores/jieba-hanlp，本地 ONNX，异步
```

**同一时刻只能启用一个 jieba provider**（同时启用会报 `service jieba has been registered`）。
消费方只声明 `inject: ['jieba']`，**切换 provider 不需要改本插件、也不需要额外配置项**。

**koishi.yml 里把 chatlog 排在 group-gags 之前**（收集器先注册，指令才不会被收集）。

## 功能

### 1. 「你好」

群里有人发 `你好` → 回复 `你emoji活了`（可配置）。

### 2. 问玩法

| 输入 | 效果 |
|---|---|
| `问几点了` | `几` → 随机 0~10 |
| `问我有多少` | `多少` → 随机数字 |
| `问你好还是坏` | `还是` → 二选一 |
| `问这是不是我` | 你/我 互换 |
| `问这是谁` | 随机圈一个群成员 |
| `问这是什么` / `问为什么…` | 查 chatlog 词表/历史随机作答 |

### 3. 复读

同一句话在本群连发两次时，按概率（默认 80%）复读，有时倒序复读。分享卡片跳过。

### 4. Mock（中间件）

按概率用本群历史消息替换当前消息（分词相似匹配，命中后消耗该条）。

### 5. `mock` / `imitate` / `模仿` 命令

```
mock          → 随机取一句本群历史消息
mock 什么     → 只选包含「什么」的
```

输出名人名言格式：

```
「我闷什么时候玩」
—— 赛亚饿·爱因斯坦
```

## 配置

功能开关（你好/问/复读/Mock 各自独立）、回复概率、名人库、署名格式等，见 Config 面板。
