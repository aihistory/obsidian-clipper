# 增强的模板触发器语法

本文档介绍了 Obsidian Web Clipper 中增强的模板触发器系统，它支持更复杂和灵活的规则匹配。

## 概述

增强的模板触发器系统提供了以下新功能：

- **组合条件**：支持 AND/OR 逻辑组合多个条件
- **多种匹配类型**：URL、标题、DOM元素、元数据、时间等
- **通配符支持**：在URL模式中使用 `*` 通配符
- **更丰富的Schema.org查询**：支持复杂的结构化数据匹配
- **时间条件**：基于时间或日期的触发条件

## 基本语法

### 1. 简单匹配

```
url:https://example.com
title:contains("重要文章")
schema:@Article
```

### 2. 组合条件

使用 `AND`、`OR` 操作符组合多个条件：

```
url:https://example.com AND title:contains("技术")
(url:https://blog.com OR url:https://news.com) AND schema:@Article
```

### 3. 括号分组

使用括号来控制操作符优先级：

```
(url:https://example.com AND title:contains("重要")) OR (url:https://other.com AND schema:@NewsArticle)
```

## 匹配器类型

### URL 匹配器

支持多种URL匹配模式：

```typescript
// 简单前缀匹配
url:https://example.com

// 通配符匹配
url:https://*.example.com/*
url:https://example.com/article/*

// 正则表达式匹配
url:/^https:\/\/www\.imdb\.com\/title\/tt\d+\/.*$/

// 路径参数匹配
url:https://example.com/article/{id}
```

### 标题匹配器

基于页面标题进行匹配：

```typescript
// 包含关键词
title:contains("重要")

// 开头匹配
title:startsWith("技术")

// 结尾匹配
title:endsWith("指南")

// 正则表达式匹配
title:regex(/^\[技术\]/)

// 精确匹配
title:技术文章
```

### Schema.org 匹配器

匹配结构化数据：

```typescript
// 匹配特定类型
schema:@Article
schema:@Recipe
schema:@Product

// 匹配特定属性
schema:@Article.author
schema:@Recipe.cookTime

// 匹配特定值
schema:@Article.author=张三
schema:@Recipe.cookTime=PT30M
```

### DOM 选择器匹配器

基于页面DOM元素进行匹配：

```typescript
// 匹配CSS选择器
selector:.article-content
selector:#main-content
selector:article[data-type="blog"]

// 匹配特定元素
selector:h1.title
selector:.author-name
```

### 元数据匹配器

匹配页面的meta标签：

```typescript
// 匹配Open Graph类型
meta:og:type=article
meta:og:type=website

// 匹配其他meta标签
meta:description
meta:keywords=技术,编程
```

### 时间匹配器

基于时间条件进行匹配：

```typescript
// 时间范围匹配
time:between(09:00,18:00)

// 星期匹配
time:weekday(monday)
time:weekday(friday)
```

## 高级用法示例

### 1. 技术博客模板

```
(url:https://tech.example.com OR url:https://dev.example.com) AND 
(title:contains("教程") OR title:contains("指南")) AND 
schema:@Article
```

### 2. 新闻文章模板

```
(url:https://news.example.com OR url:https://*.news.com) AND 
(title:contains("新闻") OR title:contains("报道")) AND 
time:between(06:00,22:00)
```

### 3. 产品页面模板

```
schema:@Product AND 
(selector:.product-price OR selector:.buy-button) AND 
meta:og:type=product
```

### 4. 食谱模板

```
schema:@Recipe AND 
(selector:.ingredients OR selector:.instructions) AND 
title:contains("食谱")
```

### 5. 工作日技术文章模板

```
url:https://tech.example.com AND 
title:contains("技术") AND 
time:weekday(monday) AND 
time:between(09:00,17:00)
```

## 优先级系统

### 显式优先级

可以在规则前指定优先级：

```
priority:10 url:https://important.example.com
priority:5 url:https://example.com
```

### 自动优先级

系统会根据以下因素自动调整优先级：

1. **模板列表顺序**：列表中的模板优先级更高
2. **规则复杂度**：更具体的规则优先级更高
3. **匹配历史**：频繁匹配的规则优先级更高

## 性能优化

### 缓存策略

- URL匹配结果缓存30秒
- Schema.org数据缓存
- DOM查询结果缓存
- 正则表达式预编译

### 短路求值

- AND条件：第一个失败的条件会立即返回false
- OR条件：第一个成功的条件会立即返回true

## 错误处理

### 语法错误

如果规则语法有误，系统会：

1. 记录错误日志
2. 回退到简单URL匹配
3. 继续处理其他规则

### 运行时错误

如果匹配过程中出现错误：

1. 记录错误日志
2. 跳过当前规则
3. 继续处理其他规则

## 调试模式

启用调试模式可以查看详细的匹配过程：

```typescript
// 在控制台中查看匹配日志
console.log('Template matched:', template.name, 'with rule:', expression.toString());
```

## 迁移指南

### 从旧语法迁移

旧语法仍然完全支持，无需立即迁移：

```typescript
// 旧语法（仍然有效）
https://example.com
/^https:\/\/example\.com\/.*$/
schema:@Article

// 新语法（增强功能）
url:https://example.com
url:/^https:\/\/example\.com\/.*$/
schema:@Article
```

### 逐步迁移建议

1. **保持现有规则不变**
2. **逐步添加新功能**
3. **测试新规则**
4. **优化和调整**

## 最佳实践

### 1. 规则设计

- 从简单规则开始
- 逐步增加复杂度
- 使用括号明确优先级
- 避免过于复杂的嵌套

### 2. 性能考虑

- 优先使用URL匹配（最快）
- 避免复杂的DOM查询
- 合理使用缓存
- 定期清理无用规则

### 3. 维护性

- 使用有意义的规则名称
- 添加注释说明
- 定期审查和优化
- 保持规则简洁

## 常见问题

### Q: 如何匹配包含特殊字符的URL？

A: 使用正则表达式或转义特殊字符：

```typescript
url:/https:\/\/example\.com\/path\?param=value/
```

### Q: 如何匹配多个Schema.org类型？

A: 使用OR操作符：

```typescript
schema:@Article OR schema:@BlogPosting OR schema:@NewsArticle
```

### Q: 如何基于页面内容进行匹配？

A: 使用DOM选择器：

```typescript
selector:.content AND title:contains("关键词")
```

### Q: 如何处理动态内容？

A: 使用通配符或正则表达式：

```typescript
url:https://example.com/article/*
title:regex(/.*动态内容.*/)
```

## 更新日志

### v2.0.0
- 添加组合条件支持
- 新增多种匹配器类型
- 实现优先级系统
- 添加性能优化

### v1.0.0
- 基础URL匹配
- 正则表达式支持
- Schema.org匹配 