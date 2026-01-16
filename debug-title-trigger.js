#!/usr/bin/env node

// 模拟触发器测试 - 测试 title:contains("Wikipedia") 匹配器

console.log('🔍 调试 title:contains("Wikipedia") 触发器...\n');

// 模拟匹配上下文
const mockContext = {
    url: 'https://en.wikipedia.org/wiki/JavaScript',
    title: 'JavaScript - Wikipedia',
    description: 'JavaScript, often abbreviated JS, is a programming language...',
    schemaOrgData: [],
    dom: {
        querySelectorAll: (selector) => {
            console.log(`🔍 模拟查询选择器: ${selector}`);
            return []; // 模拟没有找到元素
        }
    },
    meta: {
        'og:title': 'JavaScript - Wikipedia',
        'og:type': 'website',
        'description': 'JavaScript programming language'
    },
    currentTime: new Date()
};

// 测试标题匹配器
function testTitleMatcher(title, pattern, operation = 'contains') {
    console.log(`\n📋 测试标题匹配器:`);
    console.log(`   标题: "${title}"`);
    console.log(`   模式: "${pattern}"`);
    console.log(`   操作: ${operation}`);
    
    if (!title || typeof title !== 'string') {
        console.log(`❌ 标题无效`);
        return false;
    }

    const titleLower = title.toLowerCase();
    const patternLower = pattern.replace(/^["']|["']$/g, '').toLowerCase();
    
    console.log(`   处理后标题: "${titleLower}"`);
    console.log(`   处理后模式: "${patternLower}"`);
    
    let result = false;
    switch (operation) {
        case 'contains':
            result = titleLower.includes(patternLower);
            break;
        case 'startsWith':
            result = titleLower.startsWith(patternLower);
            break;
        case 'endsWith':
            result = titleLower.endsWith(patternLower);
            break;
        default:
            result = titleLower.includes(patternLower);
    }
    
    console.log(`   结果: ${result ? '✅ 匹配' : '❌ 不匹配'}`);
    return result;
}

// 测试规则解析
function testRuleParsing(rule) {
    console.log(`\n🔧 测试规则解析: "${rule}"`);
    
    // 简单解析 title:contains("Wikipedia")
    const match = rule.match(/^title:(\w+)\(["']?([^"')]+)["']?\)$/);
    if (match) {
        const [, operation, pattern] = match;
        console.log(`   解析结果: 操作=${operation}, 模式=${pattern}`);
        return { type: 'title', operation, pattern };
    }
    
    // 简单解析 title:value 格式
    const simpleMatch = rule.match(/^title:(.+)$/);
    if (simpleMatch) {
        const pattern = simpleMatch[1];
        console.log(`   简单解析结果: 模式=${pattern}`);
        return { type: 'title', operation: 'contains', pattern };
    }
    
    console.log(`   ❌ 无法解析规则`);
    return null;
}

// 运行测试
console.log('🧪 开始测试...\n');

// 测试1: 基本的title匹配
console.log('=== 测试1: 基本标题匹配 ===');
testTitleMatcher('JavaScript - Wikipedia', 'Wikipedia');
testTitleMatcher('JavaScript - Wikipedia', 'wikipedia'); // 测试大小写
testTitleMatcher('JavaScript - Wikipedia', 'GitHub'); // 测试不匹配

// 测试2: 规则解析
console.log('\n=== 测试2: 规则解析 ===');
const rule1 = 'title:contains("Wikipedia")';
const rule2 = 'title:contains(Wikipedia)';
const rule3 = 'title:Wikipedia';

const parsed1 = testRuleParsing(rule1);
const parsed2 = testRuleParsing(rule2);
const parsed3 = testRuleParsing(rule3);

// 测试3: 完整匹配流程
console.log('\n=== 测试3: 完整匹配流程 ===');
if (parsed1) {
    console.log(`\n🎯 测试规则: ${rule1}`);
    testTitleMatcher(mockContext.title, parsed1.pattern, parsed1.operation);
}

if (parsed2) {
    console.log(`\n🎯 测试规则: ${rule2}`);
    testTitleMatcher(mockContext.title, parsed2.pattern, parsed2.operation);
}

if (parsed3) {
    console.log(`\n🎯 测试规则: ${rule3}`);
    testTitleMatcher(mockContext.title, parsed3.pattern, parsed3.operation);
}

// 测试4: 模拟模板匹配
console.log('\n=== 测试4: 模拟模板匹配 ===');
const testTemplates = [
    {
        name: 'Wikipedia模板',
        triggers: ['title:contains("Wikipedia")']
    },
    {
        name: 'GitHub模板',
        triggers: ['title:contains("GitHub")']
    }
];

console.log(`\n📝 测试模板列表:`);
testTemplates.forEach((template, index) => {
    console.log(`   ${index + 1}. ${template.name}: ${template.triggers.join(', ')}`);
});

console.log(`\n🔍 当前页面信息:`);
console.log(`   URL: ${mockContext.url}`);
console.log(`   标题: ${mockContext.title}`);

console.log(`\n🎯 匹配结果:`);
testTemplates.forEach(template => {
    template.triggers.forEach(trigger => {
        const parsed = testRuleParsing(trigger);
        if (parsed && parsed.type === 'title') {
            const matches = testTitleMatcher(mockContext.title, parsed.pattern, parsed.operation);
            if (matches) {
                console.log(`   ✅ 匹配到模板: ${template.name} (规则: ${trigger})`);
            } else {
                console.log(`   ❌ 不匹配模板: ${template.name} (规则: ${trigger})`);
            }
        }
    });
});

console.log('\n🎉 测试完成！');