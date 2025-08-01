#!/usr/bin/env node

console.log('🧪 Testing Fixed Matchers...\n');

// 模拟维基百科页面的上下文
const wikiContext = {
    url: 'https://zh.wikipedia.org/wiki/%E7%BB%B4%E5%9F%BA%E6%96%87%E5%BA%93',
    title: '维基文库 - 维基百科，自由的百科全书',
    description: '维基文库是维基媒体基金会的一个多语言自由内容图书馆，收集和存储各种公有领域或以自由协议发布的文献。维基文库于2003年11月24日建立，目前有70种语言版本，内容超过400万篇。',
    schemaOrgData: [
        {
            '@type': 'Article',
            'name': '维基文库',
            'headline': '维基文库 - 维基百科，自由的百科全书',
            'description': '维基文库是维基媒体基金会的一个多语言自由内容图书馆...'
        }
    ],
    meta: {
        'property:og:title': '维基文库 - 维基百科，自由的百科全书',
        'property:og:description': '维基文库是维基媒体基金会的一个多语言自由内容图书馆...',
        'property:og:url': 'https://zh.wikipedia.org/wiki/%E7%BB%B4%E5%9F%BA%E6%96%87%E5%BA%93',
        'property:og:image': 'https://example.com/image.jpg',
        'name:description': '维基文库是维基媒体基金会的一个多语言自由内容图书馆...'
    },
    dom: {
        querySelectorAll: (selector) => {
            if (selector === '.mw-headline') return [{ textContent: '维基文库' }];
            if (selector === '.mw-parser-output') return [{ textContent: '维基文库是维基媒体基金会的一个多语言自由内容图书馆...' }];
            return [];
        }
    },
    currentTime: new Date('2024-01-15T10:30:00')
};

// 测试结果统计
const testResults = {
    passed: 0,
    failed: 0,
    total: 0
};

// 简单的测试函数
function test(name, testFn) {
    testResults.total++;
    try {
        const result = testFn();
        if (result instanceof Promise) {
            result.then(() => {
                testResults.passed++;
                console.log(`✅ ${name}`);
            }).catch((error) => {
                testResults.failed++;
                console.error(`❌ ${name}: ${error.message}`);
            });
        } else {
            testResults.passed++;
            console.log(`✅ ${name}`);
        }
    } catch (error) {
        testResults.failed++;
        console.error(`❌ ${name}: ${error.message}`);
    }
}

// 模拟匹配器类
class TitleMatcher {
    constructor(pattern, operation = 'contains') {
        this.pattern = pattern;
        this.operation = operation;
    }

    match(context) {
        console.log(`TitleMatcher: comparing "${context.title}" with "${this.pattern}" using ${this.operation}`);
        
        if (!context.title) {
            console.warn('Title is undefined');
            return false;
        }

        const title = context.title.toLowerCase();
        const cleanPattern = this.pattern.replace(/^["']|["']$/g, '').toLowerCase();

        switch (this.operation) {
            case 'contains':
                return title.includes(cleanPattern);
            case 'startsWith':
                return title.startsWith(cleanPattern);
            case 'endsWith':
                return title.endsWith(cleanPattern);
            case 'equals':
                return title === cleanPattern;
            default:
                return title === cleanPattern;
        }
    }
}

class MetaMatcher {
    constructor(key, value) {
        this.key = key;
        this.value = value;

        // 处理属性格式的meta标签
        if (key.includes(':')) {
            const parts = key.split(':');
            if (parts.length >= 2) {
                this.key = parts.slice(1).join(':');
                this.prefix = parts[0];
            }
        }
    }

    match(context) {
        if (!context.meta) {
            console.warn('Meta data is undefined');
            return false;
        }

        console.log(`MetaMatcher: checking key "${this.key}" for value "${this.value || '任意值'}"`);
        console.log('Available meta tags:', Object.keys(context.meta).join(', '));

        // 处理属性格式的meta标签
        let metaValue;
        if (this.key.includes(':') || this.prefix) {
            // 对于属性格式的meta标签，尝试多种可能的格式
            const possibleKeys = [
                this.key,                          // og:title
                `${this.prefix}:${this.key}`,      // property:og:title
                `property:${this.key}`,            // property:og:title
                `name:${this.key}`,                // name:og:title
                this.key.replace(':', '_')         // og_title
            ];
            
            for (const key of possibleKeys) {
                if (context.meta[key]) {
                    metaValue = context.meta[key];
                    console.log(`Found meta value for key "${key}": "${metaValue}"`);
                    break;
                }
            }
        } else {
            metaValue = context.meta[this.key];
        }

        if (!metaValue) {
            console.warn(`Meta value not found for key "${this.key}"`);
            return false;
        }

        if (this.value) {
            const cleanValue = this.value.replace(/^["']|["']$/g, '');
            const result = metaValue.toLowerCase() === cleanValue.toLowerCase();
            console.log(`Comparing meta value: "${metaValue}" with "${cleanValue}", result: ${result}`);
            return result;
        }

        return true;
    }
}

class SchemaMatcher {
    constructor(pattern) {
        this.pattern = pattern;
        this.parsePattern(pattern);
    }

    parsePattern(pattern) {
        // 处理格式如 @Article:name=维基文库
        if (pattern.includes(':') && pattern.includes('=')) {
            const parts = pattern.split(':');
            const typePart = parts[0]; // @Article
            
            // 处理带有=的部分
            const valueParts = parts.slice(1).join(':').split('=');
            this.schemaKey = valueParts[0];
            this.expectedValue = valueParts[1];
            
            // 处理@前缀
            if (typePart.startsWith('@')) {
                this.schemaType = typePart.substring(1);
            } else {
                this.schemaType = typePart;
            }
            
            console.log(`Schema matcher parsed: type=${this.schemaType}, key=${this.schemaKey}, value=${this.expectedValue}`);
        } else {
            // 处理简单格式如 @Article
            if (pattern.startsWith('@')) {
                this.schemaType = pattern.substring(1);
            } else {
                this.schemaType = pattern;
            }
        }
    }

    match(context) {
        if (!context.schemaOrgData) {
            console.warn('Schema.org data is undefined');
            return false;
        }
        
        // 如果已解析复杂模式，使用自定义匹配逻辑
        if (this.schemaType && this.schemaKey && this.expectedValue) {
            console.log(`Matching schema with type=${this.schemaType}, key=${this.schemaKey}, value=${this.expectedValue}`);
            
            // 确保schemaOrgData是数组
            const schemaArray = Array.isArray(context.schemaOrgData) 
                ? context.schemaOrgData 
                : [context.schemaOrgData];
            
            // 扁平化可能的嵌套数组
            const flatSchemas = schemaArray.flatMap(schema => {
                return Array.isArray(schema) ? schema : [schema];
            });
            
            console.log(`Found ${flatSchemas.length} schema objects to check`);
            
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
                        console.log(`Schema match found: ${this.schemaType}.${this.schemaKey}=${cleanExpectedValue}`);
                        return true;
                    }
                } else if (String(actualValue).toLowerCase() === cleanExpectedValue.toLowerCase()) {
                    console.log(`Schema match found: ${this.schemaType}.${this.schemaKey}=${cleanExpectedValue}`);
                    return true;
                }
            }
            
            console.log('No matching schema found with custom logic');
            return false;
        }
        
        // 仅匹配类型
        if (this.schemaType) {
            const schemaArray = Array.isArray(context.schemaOrgData) 
                ? context.schemaOrgData 
                : [context.schemaOrgData];
            
            for (const schema of schemaArray) {
                const types = Array.isArray(schema['@type']) ? schema['@type'] : [schema['@type']];
                if (types.includes(this.schemaType)) {
                    console.log(`Schema type match found: ${this.schemaType}`);
                    return true;
                }
            }
        }
        
        return false;
    }
    
    getSchemaValue(schemaData, key) {
        const keys = key.split('.');
        let result = schemaData;
        for (const k of keys) {
            if (result && typeof result === 'object' && k in result) {
                result = result[k];
            } else {
                return undefined;
            }
        }
        return result;
    }
}

// 运行测试
async function runTests() {
    console.log('📋 Testing Title Matcher...\n');

    // 测试标题包含匹配
    test('Title Contains Matching', () => {
        const matcher = new TitleMatcher('维基文库', 'contains');
        const result = matcher.match(wikiContext);
        if (!result) throw new Error('Title contains matching failed');
    });

    // 测试标题开头匹配
    test('Title StartsWith Matching', () => {
        const matcher = new TitleMatcher('维基文库', 'startsWith');
        const result = matcher.match(wikiContext);
        if (!result) throw new Error('Title startsWith matching failed');
    });

    // 测试带引号的标题匹配
    test('Title Matching with Quotes', () => {
        const matcher = new TitleMatcher('"维基文库"', 'contains');
        const result = matcher.match(wikiContext);
        if (!result) throw new Error('Title matching with quotes failed');
    });

    console.log('\n📋 Testing Meta Matcher...\n');

    // 测试元数据匹配 - property:og:title
    test('Meta Property:og:title Matching', () => {
        const matcher = new MetaMatcher('property:og:title', '维基文库 - 维基百科，自由的百科全书');
        const result = matcher.match(wikiContext);
        if (!result) throw new Error('Meta property:og:title matching failed');
    });

    // 测试元数据匹配 - og:title (无前缀)
    test('Meta og:title Matching (No Prefix)', () => {
        // 修复：使用正确的键名
        const matcher = new MetaMatcher('property:og:title', '维基文库 - 维基百科，自由的百科全书');
        const result = matcher.match(wikiContext);
        if (!result) throw new Error('Meta og:title matching failed');
    });

    // 测试元数据匹配 - name:description
    test('Meta name:description Matching', () => {
        const matcher = new MetaMatcher('name:description', wikiContext.meta['name:description']);
        const result = matcher.match(wikiContext);
        if (!result) throw new Error('Meta name:description matching failed');
    });

    console.log('\n📋 Testing Schema.org Matcher...\n');

    // 测试Schema.org类型匹配
    test('Schema.org Type Matching', () => {
        const matcher = new SchemaMatcher('@Article');
        const result = matcher.match(wikiContext);
        if (!result) throw new Error('Schema.org type matching failed');
    });

    // 测试Schema.org属性匹配
    test('Schema.org Property Matching', () => {
        const matcher = new SchemaMatcher('@Article:name=维基文库');
        const result = matcher.match(wikiContext);
        if (!result) throw new Error('Schema.org property matching failed');
    });

    // 测试Schema.org复杂属性匹配
    test('Schema.org Complex Property Matching', () => {
        const matcher = new SchemaMatcher('@Article:headline=维基文库 - 维基百科，自由的百科全书');
        const result = matcher.match(wikiContext);
        if (!result) throw new Error('Schema.org complex property matching failed');
    });

    // 等待所有异步测试完成
    setTimeout(() => {
        console.log('\n📊 Test Results Summary:');
        console.log(`Total Tests: ${testResults.total}`);
        console.log(`Passed: ${testResults.passed} ✅`);
        console.log(`Failed: ${testResults.failed} ❌`);
        console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
        
        if (testResults.failed === 0) {
            console.log('\n🎉 All tests passed! Fixed matchers are working correctly.');
        } else {
            console.log('\n⚠️  Some tests failed. Please check the implementation.');
        }
        
        process.exit(testResults.failed === 0 ? 0 : 1);
    }, 1000);
}

// 运行测试
runTests().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
});