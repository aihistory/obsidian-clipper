# 匹配器修复总结

## 问题概述

在增强的模板触发器系统中，发现了以下几个匹配器存在问题：

1. **标题匹配器（Title Matcher）**：无法正确匹配带引号的标题和特殊格式的标题
2. **元数据匹配器（Meta Matcher）**：无法匹配复杂格式的meta标签，如`property:og:title`
3. **Schema.org匹配器**：无法处理复杂格式的Schema.org匹配，如`@Article:name=维基文库`

## 修复方案

### 1. 标题匹配器修复

```typescript
class TitleMatcher implements Matcher {
    // 修复前：
    async match(context: MatchContext): Promise<boolean> {
        const title = context.title.toLowerCase();
        const pattern = this.pattern.toLowerCase();
        // ...
    }

    // 修复后：
    async match(context: MatchContext): Promise<boolean> {
        // 确保标题存在
        if (!context.title || typeof context.title !== 'string') {
            console.warn('Title matcher: context.title is undefined or not a string');
            return false;
        }

        const title = context.title.toLowerCase();
        // 移除引号，如果存在的话
        const cleanPattern = this.pattern.replace(/^["']|["']$/g, '').toLowerCase();
        
        console.log(`TitleMatcher: comparing "${title}" with "${cleanPattern}" using ${this.operation}`);
        // ...
    }
}
```

主要改进：
- 添加了标题存在性检查
- 移除了引号，支持带引号的匹配模式
- 添加了详细的日志输出，便于调试
- 添加了更多的匹配操作，如`equals`

### 2. 元数据匹配器修复

```typescript
class MetaMatcher implements Matcher {
    // 修复前：
    async match(context: MatchContext): Promise<boolean> {
        if (!context.meta) return false;
        
        const metaValue = context.meta[this.key];
        if (!metaValue) return false;
        // ...
    }

    // 修复后：
    constructor(key: string, value?: string) {
        // 处理属性格式的meta标签，如meta:property:og:title
        if (key.includes(':')) {
            const parts = key.split(':');
            if (parts.length >= 2) {
                // 重构key为属性名:属性值格式
                this.key = parts.slice(1).join(':');
            }
        }
    }

    async match(context: MatchContext): Promise<boolean> {
        // ...
        // 处理属性格式的meta标签
        let metaValue;
        if (this.key.includes(':')) {
            // 对于属性格式的meta标签，尝试多种可能的格式
            const possibleKeys = [
                this.key,                     // property:og:title
                `property:${this.key}`,       // property:property:og:title
                `name:${this.key}`,           // name:property:og:title
                this.key.replace(':', '_')    // property_og:title
            ];
            
            for (const key of possibleKeys) {
                if (context.meta[key]) {
                    metaValue = context.meta[key];
                    break;
                }
            }
        }
        // ...
    }
}
```

主要改进：
- 支持复杂格式的meta标签路径，如`property:og:title`
- 尝试多种可能的键名格式，提高匹配成功率
- 添加了详细的日志输出，便于调试
- 支持带引号的值匹配

### 3. Schema.org匹配器修复

```typescript
class SchemaMatcher implements Matcher {
    // 修复前：
    async match(context: MatchContext): Promise<boolean> {
        return matchSchemaPattern(this.pattern, context.schemaOrgData);
    }

    // 修复后：
    private schemaType: string | null = null;
    private schemaKey: string | null = null;
    private expectedValue: string | null = null;

    constructor(private pattern: string) {
        // 解析复杂的Schema.org匹配模式
        this.parsePattern(pattern);
    }

    private parsePattern(pattern: string): void {
        // 处理格式如 schema:@Article:name=维基文库
        if (pattern.includes(':') && pattern.includes('=')) {
            const parts = pattern.split(':');
            const typePart = parts[0]; // @Article
            
            // 处理带有=的部分
            const valueParts = parts.slice(1).join(':').split('=');
            this.schemaKey = valueParts[0];
            this.expectedValue = valueParts[1];
            // ...
        }
    }

    async match(context: MatchContext): Promise<boolean> {
        // 如果已解析复杂模式，使用自定义匹配逻辑
        if (this.schemaType && this.schemaKey && this.expectedValue) {
            // 查找匹配的schema对象
            for (const schema of flatSchemas) {
                // 检查类型
                const types = Array.isArray(schema['@type']) ? schema['@type'] : [schema['@type']];
                if (!types.includes(this.schemaType)) continue;
                
                // 获取属性值
                const actualValue = this.getSchemaValue(schema, this.schemaKey);
                if (actualValue === undefined) continue;
                
                // 比较值
                const cleanExpectedValue = this.expectedValue.replace(/^["']|["']$/g, '');
                if (Array.isArray(actualValue)) {
                    if (actualValue.includes(cleanExpectedValue)) {
                        return true;
                    }
                } else if (String(actualValue).toLowerCase() === cleanExpectedValue.toLowerCase()) {
                    return true;
                }
            }
            // ...
        }
    }
}
```

主要改进：
- 支持复杂格式的Schema.org匹配，如`@Article:name=维基文库`
- 添加了详细的解析逻辑，分离类型、属性和值
- 支持嵌套的Schema.org数据结构
- 添加了详细的日志输出，便于调试

### 4. 解析器和词法分析器修复

```typescript
class Lexer {
    // 修复前：
    private isOperator(char: string): boolean {
        return char === '&' || char === '|' || char === '=' || char === ':' || char === '/';
    }

    // 修复后：
    private isOperator(char: string): boolean {
        return char === '&' || char === '|' || char === '=' || char === ':' || char === '/' || char === '@';
    }
    
    // 添加了更多的错误处理和日志输出
    // ...
}

class Parser {
    // 修复前：
    private parseMatcher(): MatcherExpression {
        const identifier = this.advance().value;
        
        if (this.match(TokenType.OPERATOR, ':')) {
            this.advance(); // Consume ':'
            const value = this.parseValue();
            return new MatcherExpression(identifier, value);
        }
        // ...
    }

    // 修复后：
    private parseMatcher(): MatcherExpression {
        const identifier = this.advance().value;
        
        // 处理优先级前缀
        if (identifier === 'priority' && this.match(TokenType.OPERATOR, ':')) {
            // ...
        }
        
        // 处理标准匹配器格式
        if (this.match(TokenType.OPERATOR, ':')) {
            this.advance(); // Consume ':'
            
            // 处理特殊格式，如 meta:property:og:title=value
            let value = this.parseValue();
            
            // 检查是否有更多的冒号，用于处理复杂的格式
            while (this.match(TokenType.OPERATOR, ':') && 
                  (identifier === 'meta' || identifier === 'schema')) {
                this.advance(); // Consume ':'
                const nextValue = this.parseValue();
                value = value + ':' + nextValue;
            }
            
            // 处理等号分隔的值
            if (this.match(TokenType.OPERATOR, '=')) {
                this.advance(); // Consume '='
                const equalValue = this.parseValue();
                value = value + '=' + equalValue;
            }
            // ...
        }
        // ...
    }
}
```

主要改进：
- 支持`@`符号作为操作符，用于Schema.org类型
- 支持复杂的嵌套冒号格式，如`meta:property:og:title`
- 支持优先级前缀，如`priority:10`
- 添加了详细的日志输出，便于调试

### 5. 上下文对象增强

```typescript
const memoizedFindMatchingTemplate = memoizeWithExpiration(
    async (url: string, getPageData: () => Promise<{
        title?: string;
        description?: string;
        schemaOrgData: any;
        dom?: Document;
        meta?: Record<string, string>;
    }>): Promise<Template | undefined> => {
        // ...
        // 获取页面数据
        const pageData = await getPageData();
        const { title = '', description = '', schemaOrgData, dom, meta = {} } = pageData;
        
        // 获取当前时间
        const currentTime = new Date();

        // 构建完整的上下文对象
        const context: MatchContext = {
            url,
            title,
            description,
            schemaOrgData,
            dom,
            meta,
            currentTime
        };
        // ...
    }
);
```

主要改进：
- 扩展了`getPageData`函数的参数类型，支持更多的页面数据
- 添加了当前时间到上下文对象，支持时间条件匹配
- 添加了详细的日志输出，便于调试

## 测试结果

创建了专门的测试脚本`scripts/test-matchers.js`，测试了所有修复后的匹配器：

```
🧪 Testing Fixed Matchers...

📋 Testing Title Matcher...
✅ Title Contains Matching
✅ Title StartsWith Matching
✅ Title Matching with Quotes

📋 Testing Meta Matcher...
✅ Meta Property:og:title Matching
✅ Meta og:title Matching (No Prefix)
✅ Meta name:description Matching

📋 Testing Schema.org Matcher...
✅ Schema.org Type Matching
✅ Schema.org Property Matching
✅ Schema.org Complex Property Matching

📊 Test Results Summary:
Total Tests: 9
Passed: 9 ✅
Failed: 0 ❌
Success Rate: 100.0%

🎉 All tests passed! Fixed matchers are working correctly.
```

## 结论

通过这些修复，Template triggers 系统现在能够支持更多的规则模式：

1. **标题匹配**：支持包含、开头、结尾、正则表达式等多种匹配方式
2. **元数据匹配**：支持复杂的meta标签路径，如`property:og:title=维基文库`
3. **Schema.org匹配**：支持复杂的Schema.org属性匹配，如`@Article:name=维基文库`

这些改进使得模板触发系统更加灵活和强大，能够满足更多的实际应用场景。